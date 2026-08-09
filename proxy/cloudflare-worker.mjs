const MAX_BODY_BYTES = 64 * 1024;
const MAX_PROMPT_CHARACTERS = 24000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
const ALLOWED_PROVIDERS = new Set(["auto", "openai", "google", "anthropic"]);
const rateLimitBuckets = new Map();

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env || {}, ctx);
  }
};

export async function handleRequest(request, env, ctx) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = resolveAllowedOrigin(origin, env);

  if (!hasConfiguredOrigins(env)) {
    return jsonResponse({ error: "Set ALLOWED_ORIGINS before enabling the AI proxy." }, 503, null);
  }

  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigin) {
      return jsonResponse({ error: "Origin is not allowed." }, 403, null);
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders(allowedOrigin)
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST." }, 405, allowedOrigin);
  }

  if (!origin) {
    return jsonResponse({ error: "A browser origin is required." }, 403, null);
  }

  if (!allowedOrigin) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, null);
  }

  const rateLimit = checkRateLimit(request, env, allowedOrigin);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Too many proxy requests. Try again shortly." },
      429,
      allowedOrigin,
      rateLimit.headers
    );
  }

  try {
    const payload = normalizeProxyRequest(await readJsonBody(request, MAX_BODY_BYTES));
    const provider = selectProvider(payload.provider, env);
    const result = await callProvider(provider, payload, env);
    return jsonResponse(result, 200, allowedOrigin, rateLimit.headers);
  } catch (error) {
    const requestedStatus = Number(error && error.status);
    const status = requestedStatus >= 400 && requestedStatus < 500 ? requestedStatus : 500;
    const internalMessage = sanitizeErrorMessage(error && error.message ? error.message : String(error));
    const publicMessage = status === 500 ? "AI proxy request failed." : internalMessage;
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(logProxyError(status));
    }
    return jsonResponse({ error: publicMessage }, status, allowedOrigin, rateLimit.headers);
  }
}

export function normalizeProxyRequest(input) {
  if (!input || typeof input !== "object") {
    throw httpError(400, "Request body must be JSON.");
  }

  if (input.schemaVersion !== "summarize-this-ai-proxy-request-v1") {
    throw httpError(400, "Unsupported proxy request schema.");
  }

  const provider = String(input.provider || "auto").toLowerCase();
  if (!ALLOWED_PROVIDERS.has(provider)) {
    throw httpError(400, "Unsupported provider.");
  }

  const prompt = String(input.prompt || "");
  if (!prompt.trim()) {
    throw httpError(400, "Prompt is required.");
  }
  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw httpError(413, "Prompt is too large.");
  }

  return {
    provider,
    model: cleanText(input.model, 120),
    strategy: cleanText(input.strategy, 80) || "cost-effective",
    outputMode: cleanText(input.outputMode, 80) || "operational-ledger",
    outputLanguage: cleanText(input.outputLanguage, 20) || "en",
    maxOutputTokens: clampNumber(input.maxOutputTokens || input.maxTokens, 900, 300, 2000),
    prompt
  };
}

export function selectProvider(requestedProvider, env) {
  const preferred = requestedProvider === "auto"
    ? String(env.DEFAULT_PROVIDER || "").toLowerCase()
    : requestedProvider;
  const candidates = preferred && preferred !== "auto"
    ? [preferred]
    : ["openai", "google", "anthropic"];

  for (const provider of candidates) {
    if (provider === "openai" && env.OPENAI_API_KEY) return "openai";
    if (provider === "google" && env.GOOGLE_API_KEY) return "google";
    if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return "anthropic";
  }

  throw httpError(400, "No server-side provider key is configured for the requested provider.");
}

export function resolveAllowedOrigin(origin, env) {
  if (!origin) return "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.length) return "";
  if (allowed.includes("*")) return "";
  return allowed.includes(origin) ? origin : "";
}

export function hasConfiguredOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .some((value) => value && value !== "*");
}

export function selectModel(provider, requestedModel, env) {
  const defaults = {
    openai: { envKey: "OPENAI_MODEL", fallback: "gpt-4o-mini", allowedKey: "OPENAI_ALLOWED_MODELS" },
    google: { envKey: "GOOGLE_MODEL", fallback: "gemini-1.5-flash", allowedKey: "GOOGLE_ALLOWED_MODELS" },
    anthropic: { envKey: "ANTHROPIC_MODEL", fallback: "claude-3-5-haiku-20241022", allowedKey: "ANTHROPIC_ALLOWED_MODELS" }
  };
  const config = defaults[provider];
  if (!config) throw httpError(400, "Unsupported provider.");

  const fallback = cleanText(env[config.envKey], 120) || config.fallback;
  const requested = cleanText(requestedModel, 120);
  const allowed = String(env[config.allowedKey] || "")
    .split(",")
    .map((value) => cleanText(value, 120))
    .filter(Boolean);

  if (!requested) return fallback;
  if (!allowed.length) return fallback;
  return allowed.includes(requested) ? requested : fallback;
}

export function checkRateLimit(request, env, allowedOrigin, now = Date.now()) {
  const limit = parseRateLimit(env.RATE_LIMIT_PER_MINUTE);
  if (limit <= 0) {
    return { allowed: true, limit: 0, remaining: 0, resetSeconds: 0, headers: {} };
  }

  pruneRateLimitBuckets(now);

  const windowMs = 60 * 1000;
  const key = buildRateLimitKey(request, allowedOrigin);
  const existing = rateLimitBuckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const headers = {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(remaining),
    "RateLimit-Reset": String(resetSeconds)
  };

  if (bucket.count > limit) {
    headers["Retry-After"] = String(resetSeconds);
    return { allowed: false, limit, remaining: 0, resetSeconds, headers };
  }

  return { allowed: true, limit, remaining, resetSeconds, headers };
}

export function resetRateLimitBuckets() {
  rateLimitBuckets.clear();
}

async function callProvider(provider, payload, env) {
  if (provider === "openai") return callOpenAI(payload, env);
  if (provider === "google") return callGoogle(payload, env);
  if (provider === "anthropic") return callAnthropic(payload, env);
  throw httpError(400, "Unsupported provider.");
}

async function callOpenAI(payload, env) {
  const model = selectModel("openai", payload.model, env);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You analyze Trello cards for project teams. Return only valid JSON." },
        { role: "user", content: payload.prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: payload.maxOutputTokens
    })
  });
  const data = await parseProviderJson(response);
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "{}";
  return proxyResult(content, {
    provider: "OpenAI via proxy",
    model,
    tokens: data.usage ? data.usage.total_tokens : 0,
    cost: null,
    costEstimated: false
  });
}

async function callGoogle(payload, env) {
  const model = selectModel("google", payload.model, env);
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GOOGLE_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: payload.prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: payload.maxOutputTokens
      }
    })
  });
  const data = await parseProviderJson(response);
  const content = data.candidates && data.candidates[0] && data.candidates[0].content
    ? data.candidates[0].content.parts.map((part) => part.text || "").join("")
    : "{}";
  return proxyResult(content, {
    provider: "Google AI via proxy",
    model,
    tokens: data.usageMetadata ? data.usageMetadata.totalTokenCount : 0,
    cost: null,
    costEstimated: false
  });
}

async function callAnthropic(payload, env) {
  const model = selectModel("anthropic", payload.model, env);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: payload.maxOutputTokens,
      temperature: 0.2,
      messages: [{ role: "user", content: payload.prompt }]
    })
  });
  const data = await parseProviderJson(response);
  const content = data.content ? data.content.map((part) => part.text || "").join("") : "{}";
  return proxyResult(content, {
    provider: "Anthropic via proxy",
    model,
    tokens: data.usage ? (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) : 0,
    cost: null,
    costEstimated: false
  });
}

async function parseProviderJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = data && data.error && data.error.message
      ? data.error.message
      : "Provider request failed.";
    throw httpError(response.status || 502, providerMessage);
  }
  return data;
}

function proxyResult(content, metadata) {
  return {
    summary: parseMaybeJson(content),
    metadata: {
      provider: metadata.provider,
      model: metadata.model,
      tokens: Math.max(0, Number(metadata.tokens) || 0),
      cost: metadata.costEstimated === true ? Math.max(0, Number(metadata.cost) || 0) : null,
      costEstimated: metadata.costEstimated === true
    }
  };
}

async function readJsonBody(request, maxBytes) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw httpError(415, "Content-Type must be application/json.");
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) {
    throw httpError(413, "Request body is too large.");
  }

  const bodyText = await readBodyTextWithLimit(request, maxBytes);
  try {
    return JSON.parse(bodyText);
  } catch (error) {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

async function readBodyTextWithLimit(request, maxBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > maxBytes) {
      throw httpError(413, "Request body is too large.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function jsonResponse(body, status, origin, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...(extraHeaders || {})
    }
  });
}

function corsHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return {
      about: String(value).slice(0, 1200),
      validationFindings: ["Proxy provider returned non-JSON content; review before trusting this summary."]
    };
  }
}

function cleanText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function parseRateLimit(value) {
  if (value === "0" || String(value).toLowerCase() === "off") return 0;
  const parsed = Number(value || DEFAULT_RATE_LIMIT_PER_MINUTE);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RATE_LIMIT_PER_MINUTE;
  return Math.min(600, Math.floor(parsed));
}

function buildRateLimitKey(request, allowedOrigin) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown-ip";
  return [allowedOrigin || "no-origin", String(ip).trim()].join("|");
}

function pruneRateLimitBuckets(now) {
  if (rateLimitBuckets.size < 1000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function sanitizeErrorMessage(value) {
  return String(value || "Proxy request failed.")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted key]")
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "[redacted key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted url]")
    .replace(/\b(api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function logProxyError(status) {
  console.warn(JSON.stringify({
    event: "summarize_this_proxy_error",
    status,
    category: status >= 500 ? "provider-or-runtime-failure" : "client-request-rejected"
  }));
}
