const crypto = require("node:crypto");
const { URL } = require("node:url");
const config = require("./backend-config");
const { createBackendStore, createId, normalizeBackendStoreOptions } = require("./backend-storage");

const BODY_LIMIT = 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const BATCH_CARD_STATUSES = new Set(["pending", "opened", "running", "analyzed", "copied", "skipped", "blocked", "failed"]);
const BATCH_EDITABLE_JOB_STATUSES = new Set(["queued", "running"]);
const BATCH_FINAL_CARD_STATUSES = new Set(["copied", "skipped", "blocked", "failed"]);

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function json(res, status, payload, headers) {
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, headers || {}));
  res.end(JSON.stringify(payload));
}

function text(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function tokenHash(token) {
  return crypto.createHmac("sha256", String(config.JWT_SECRET || ""))
    .update(String(token || ""))
    .digest("hex");
}

function scryptRecord(password, salt) {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), actualSalt, 64).toString("hex");
  return { salt: actualSalt, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.hash || !record.salt) return false;
  const candidate = scryptRecord(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(candidate.hash, "hex"), Buffer.from(record.hash, "hex"));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > BODY_LIMIT) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function summarizeText(input) {
  const normalized = String(input || "").replace(/\s+/g, " ").trim();
  const short = normalized.slice(0, 180);
  return short.length < normalized.length ? `${short}...` : short;
}

function providerMode(payload) {
  if (payload && payload.proxy && payload.proxy.enabled) return "proxy";
  if (payload && payload.provider && payload.provider.apiKey) return "direct-provider";
  return "local";
}

function providerGuardrails(payload) {
  const mode = providerMode(payload);
  return {
    mode,
    directConfigured: false,
    proxyConfigured: false,
    localFallback: mode === "local",
    valid: mode === "local",
    limitation: mode === "local"
      ? "Deterministic local summary only; review the source before acting."
      : "This backend does not execute provider or proxy requests. Use the reviewed Power-Up flow instead."
  };
}

function cleanUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    credits: Number(user.credits || 0),
    role: user.role || "user",
    suspended: Boolean(user.suspended),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function parsePagination(searchParams) {
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 25) || 25));
  const offset = Math.max(0, Number(searchParams.get("offset") || 0) || 0);
  return { limit, offset };
}

function paginate(items, limit, offset) {
  return {
    total: items.length,
    limit,
    offset,
    items: items.slice(offset, offset + limit)
  };
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] || "").trim());
  return missing.length ? `Missing required fields: ${missing.join(", ")}` : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function idempotencyKey(req) {
  return String(req.headers["idempotency-key"] || "").trim();
}

async function appendEvent(store, type, payload) {
  return store.add("events", {
    id: createId("event"),
    type,
    payload: clone(payload || {}),
    createdAt: nowIso()
  }, { limit: 250 });
}

async function appendAlert(store, severity, message, source) {
  return store.add("systemAlerts", {
    id: createId("alert"),
    severity,
    message,
    source: source || "backend",
    acknowledged: false,
    createdAt: nowIso()
  }, { limit: 250 });
}

async function checkRateLimit(store, scope, key, max, windowMs) {
  const entries = await store.listRateLimits();
  const now = Date.now();
  const active = entries.filter((item) => item.scope === scope && item.key === key && item.expiresAt > now);
  if (active.length >= max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((Math.min(...active.map((item) => item.expiresAt)) - now) / 1000))
    };
  }
  await store.touchRateLimit({
    id: createId("rate"),
    scope,
    key,
    createdAt: now,
    expiresAt: now + windowMs
  });
  return { ok: true, retryAfterSeconds: 0 };
}

function clientAddress(req) {
  const address = req && req.socket && req.socket.remoteAddress;
  return String(address || "unknown-client").trim().slice(0, 128) || "unknown-client";
}

async function withIdempotency(req, store, scope, handler) {
  const key = idempotencyKey(req);
  if (!key) return handler();
  const found = await store.findIdempotency(scope, key);
  if (found) {
    return found.response;
  }
  const response = await handler();
  await store.rememberIdempotency({
    id: createId("idem"),
    scope,
    key,
    response: clone(response),
    createdAt: nowIso()
  });
  return response;
}

function validateSummarizePayload(payload) {
  const text = String(payload && payload.text || "");
  if (!text.trim()) return "Text is required";
  if (text.trim().length < 50) return "Text too short";
  const mode = providerMode(payload);
  if (mode !== "local") {
    return "This backend only supports deterministic local summaries; it does not execute provider or proxy requests.";
  }
  return "";
}

async function createSession(store, userId, role) {
  const rawToken = `st_${crypto.randomBytes(18).toString("base64url")}`;
  const record = await store.createSession({
    userId,
    role,
    tokenHash: tokenHash(rawToken),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  });
  return {
    token: rawToken,
    session: record
  };
}

function isActiveSession(session, now = Date.now()) {
  if (!session || session.revokedAt) return false;
  const expiresAt = Date.parse(String(session.expiresAt || ""));
  return Number.isFinite(expiresAt) && expiresAt > now;
}

async function getSessionContext(store, req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = await store.findSessionByTokenHash(tokenHash(token));
  if (!session) return null;
  if (!isActiveSession(session)) {
    await store.revokeSession(tokenHash(token));
    return null;
  }
  if (session.role === "admin") {
    return { role: "admin", token, session, user: { email: config.ADMIN_EMAIL, role: "admin" } };
  }
  const user = await store.findUserById(session.userId);
  if (!user || user.suspended) return null;
  return { role: "user", token, session, user };
}

async function requireSession(store, req, res, role) {
  const context = await getSessionContext(store, req);
  if (!context) {
    json(res, 401, { success: false, error: "Unauthorized" });
    return null;
  }
  if (role && context.role !== role) {
    json(res, 403, { success: false, error: "Forbidden" });
    return null;
  }
  return context;
}

async function buildAnalytics(store) {
  const users = await store.listUsers();
  const transactions = await store.list("transactions");
  const summaries = await store.list("summaries");
  return {
    users: {
      total: users.length,
      suspended: users.filter((item) => item.suspended).length
    },
    revenue: {
      transactions: transactions.length,
      completedPurchases: transactions.filter((item) => item.type === "credit_purchase").length
    },
    usage: {
      summaries: summaries.length,
      localMode: summaries.filter((item) => item.providerMode === "local").length
    }
  };
}

function buildBatchJob(body) {
  const cards = Array.isArray(body.cards) ? body.cards : [];
  return {
    id: createId("batch"),
    listName: String(body.listName || ""),
    source: String(body.source || "popup-reviewed-batch"),
    status: "queued",
    cards: cards.map((item, index) => ({
      id: item.id || item.cardId || `card-${index + 1}`,
      name: item.name || `Card ${index + 1}`,
      status: "pending",
      queuePosition: Number(item.queuePosition || index + 1),
      attempts: 0,
      result: null,
      error: null
    })),
    concurrency: Math.max(1, Math.min(3, Number(body.concurrency || 1) || 1)),
    delaySeconds: Math.max(0, Math.min(30, Number(body.delaySeconds || 0) || 0)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    trelloWriteDefault: "off",
    approvalRequired: true,
    aiHandoffApproved: Boolean(body.aiHandoffApproved)
  };
}

function computeBatchJobStatus(job) {
  const cards = Array.isArray(job.cards) ? job.cards : [];
  if (!cards.length) return "queued";
  const terminalStates = ["analyzed", "completed", "copied", "skipped"];
  if (cards.every((item) => terminalStates.includes(item.status))) {
    if (cards.some((item) => item.status === "analyzed")) return "review-required";
    return "completed";
  }
  if (cards.some((item) => item.status === "blocked" || item.status === "failed")) {
    return cards.some((item) => item.status === "running" || item.status === "opened") ? "partial" : "needs-attention";
  }
  if (cards.some((item) => item.status === "running" || item.status === "opened" || item.status === "analyzed")) {
    return "running";
  }
  return job.status || "queued";
}

function batchValidationError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

function validateBatchCardUpdate(card, body) {
  if (body.status === undefined) return;
  const nextStatus = String(body.status || "").trim();
  if (!BATCH_CARD_STATUSES.has(nextStatus)) {
    throw batchValidationError("Unsupported batch card status. Record only a recognized reviewed-workflow state.");
  }
  const currentStatus = String(card.status || "pending");
  if (BATCH_FINAL_CARD_STATUSES.has(currentStatus) && nextStatus !== currentStatus) {
    throw batchValidationError("A terminal batch card state cannot be changed by a later sync update.");
  }
  if (currentStatus === "analyzed" && nextStatus !== "analyzed" && nextStatus !== "copied") {
    throw batchValidationError("An analyzed batch card may only remain analyzed or record a later copy action.");
  }
  if (nextStatus === "analyzed" && (!body.result || typeof body.result !== "object" || Array.isArray(body.result))) {
    throw batchValidationError("An analyzed batch card requires an observed result object.");
  }
  if (body.result !== undefined && nextStatus !== "analyzed" && currentStatus !== "analyzed") {
    throw batchValidationError("A batch result can be recorded only with an analyzed card state.");
  }
  if ((nextStatus === "blocked" || nextStatus === "failed") && !String(body.error || "").trim()) {
    throw batchValidationError("A blocked or failed batch card requires an observed error reason.");
  }
}

async function updateBatchJob(store, jobId, userId, updater) {
  const jobs = await store.list("batchJobs");
  const job = jobs.find((item) => item.id === jobId && (!userId || item.userId === userId));
  if (!job) return null;
  updater(job);
  job.updatedAt = nowIso();
  job.status = computeBatchJobStatus(job);
  await store.replace("batchJobs", jobs);
  return clone(job);
}

async function route(req, res, store) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${config.HOST}:${config.PORT}`}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    const snapshot = await store.snapshot();
    json(res, 200, {
      status: "ok",
      service: "summarize-this-backend",
      timestamp: nowIso(),
      storage: {
        users: snapshot.users.length,
        sessions: snapshot.sessions.filter((item) => isActiveSession(item)).length,
        batchJobs: snapshot.batchJobs.length
      },
      readiness: config.backendReadiness(),
      trello: config.powerUpReadiness()
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/readiness") {
    const readiness = config.backendReadiness();
    json(res, readiness.ok ? 200 : 503, {
      status: readiness.ok ? "ready" : "blocked",
      missing: readiness.missing,
      optional: readiness.optional
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/config") {
    json(res, 200, config.publicConfig());
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readBody(req);
    const missing = requireFields(body, ["email", "password", "name"]);
    if (missing) {
      json(res, 400, { success: false, error: missing });
      return;
    }
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      json(res, 400, { success: false, error: "A valid email address is required" });
      return;
    }
    const ipLimited = await checkRateLimit(store, "auth.register.ip", clientAddress(req), 20, 60 * 60_000);
    if (!ipLimited.ok) {
      json(res, 429, { success: false, error: "Too many registration attempts from this client", retryAfterSeconds: ipLimited.retryAfterSeconds });
      return;
    }
    const limited = await checkRateLimit(store, "auth.register", email, 5, 60 * 60_000);
    if (!limited.ok) {
      json(res, 429, { success: false, error: "Too many registration attempts", retryAfterSeconds: limited.retryAfterSeconds });
      return;
    }
    if (await store.findUserByEmail(email)) {
      json(res, 409, { success: false, error: "Email already exists" });
      return;
    }
    const passwordRecord = scryptRecord(body.password);
    const user = await store.createUser({
      email,
      name: String(body.name).trim(),
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt
    });
    const session = await createSession(store, user.id, "user");
    await appendEvent(store, "user.registered", { userId: user.id, email });
    json(res, 201, { success: true, user: cleanUser(user), token: session.token });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const ipLimited = await checkRateLimit(store, "auth.login.ip", clientAddress(req), 30, 60_000);
    if (!ipLimited.ok) {
      json(res, 429, { success: false, error: "Too many login attempts from this client", retryAfterSeconds: ipLimited.retryAfterSeconds });
      return;
    }
    const limited = await checkRateLimit(store, "auth.login", email, 10, 60_000);
    if (!limited.ok) {
      json(res, 429, { success: false, error: "Too many login attempts", retryAfterSeconds: limited.retryAfterSeconds });
      return;
    }
    const user = await store.findUserByEmail(email);
    if (!user || !verifyPassword(body.password, { hash: user.passwordHash, salt: user.passwordSalt }) || user.suspended) {
      json(res, 401, { success: false, error: "Invalid credentials" });
      return;
    }
    const session = await createSession(store, user.id, "user");
    await store.updateUser(user.id, { lastLoginAt: nowIso() });
    await appendEvent(store, "user.logged_in", { userId: user.id });
    json(res, 200, { success: true, user: cleanUser(user), token: session.token });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = bearerToken(req);
    if (token) await store.revokeSession(tokenHash(token));
    json(res, 200, { success: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/auth/login") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const ipLimited = await checkRateLimit(store, "admin.login.ip", clientAddress(req), 10, 15 * 60_000);
    if (!ipLimited.ok) {
      json(res, 429, { success: false, error: "Too many admin login attempts from this client", retryAfterSeconds: ipLimited.retryAfterSeconds });
      return;
    }
    const limited = await checkRateLimit(store, "admin.login", email, 5, 15 * 60_000);
    if (!limited.ok) {
      json(res, 429, { success: false, error: "Too many admin login attempts", retryAfterSeconds: limited.retryAfterSeconds });
      return;
    }
    if (email !== String(config.ADMIN_EMAIL).trim().toLowerCase() || password !== config.ADMIN_PASSWORD) {
      json(res, 401, { success: false, error: "Invalid admin credentials" });
      return;
    }
    const session = await createSession(store, "admin", "admin");
    await appendEvent(store, "admin.logged_in", { email });
    json(res, 200, { success: true, token: session.token, admin: { email: config.ADMIN_EMAIL, role: "admin" } });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/auth/logout") {
    const token = bearerToken(req);
    if (token) await store.revokeSession(tokenHash(token));
    json(res, 200, { success: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/auth/refresh") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const session = await createSession(store, "admin", "admin");
    await store.revokeSession(tokenHash(context.token));
    json(res, 200, { success: true, token: session.token, admin: { email: config.ADMIN_EMAIL, role: "admin" } });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/auth/verify") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, admin: { email: config.ADMIN_EMAIL, role: "admin" } });
    return;
  }

  if (req.method === "GET" && pathname === "/api/user/profile") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    json(res, 200, { success: true, user: cleanUser(context.user) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/user/credits") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    json(res, 200, { success: true, credits: Number(context.user.credits || 0) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/user/activity") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const events = (await store.list("events"))
      .filter((item) => item.payload && item.payload.userId === context.user.id)
      .slice(0, 20);
    json(res, 200, { success: true, activities: events });
    return;
  }

  if (req.method === "POST" && pathname === "/api/summarize") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const limit = await checkRateLimit(store, "summarize", context.user.id, 20, 60_000);
    if (!limit.ok) {
      json(res, 429, { success: false, error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds });
      return;
    }
    const body = await readBody(req);
    const validationError = validateSummarizePayload(body);
    if (validationError) {
      json(res, validationError === "Text too short" || validationError === "Text is required" ? 400 : 422, { success: false, error: validationError });
      return;
    }

    const response = await withIdempotency(req, store, `summarize:${context.user.id}`, async () => {
      const current = await store.findUserById(context.user.id);
      if (Number(current.credits || 0) < 5) {
        return { status: 402, payload: { success: false, error: "Insufficient credits" } };
      }
      const updatedUser = await store.updateUser(current.id, { credits: Number(current.credits || 0) - 5 });
      const factualExcerpt = summarizeText(body.text);
      const summary = await store.add("summaries", {
        id: createId("summary"),
        userId: current.id,
        summary: factualExcerpt,
        method: body.method || "hybrid",
        providerMode: providerMode(body),
        confidence: 0.65,
        heuristicConfidence: 0.65,
        measuredEvaluation: null,
        evidence: {
          facts: [{ claim: factualExcerpt, source: "submitted text" }],
          inferences: [],
          uncertainty: ["This deterministic excerpt does not validate completeness, context, or correctness."],
          unsupportedClaims: []
        },
        guardrails: providerGuardrails(body),
        creditsUsed: 5,
        createdAt: nowIso()
      }, { limit: 1000 });
      await store.add("transactions", {
        id: createId("txn"),
        userId: current.id,
        type: "summary_charge",
        credits: -5,
        status: "completed",
        createdAt: nowIso()
      }, { limit: 1000 });
      await appendEvent(store, "summary.created", {
        userId: current.id,
        summaryId: summary.id,
        providerMode: summary.providerMode
      });
      return { status: 200, payload: { success: true, result: summary, user: cleanUser(updatedUser) } };
    });
    json(res, response.status, response.payload);
    return;
  }

  if (req.method === "POST" && pathname === "/api/credits/purchase") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    await appendEvent(store, "credits.purchase_blocked", {
      userId: context.user.id,
      reason: "No verified payment processor is configured."
    });
    json(res, 503, {
      success: false,
      error: "Credit purchases are unavailable because this backend has no verified payment processor integration.",
      nextAction: "Configure and verify a payment provider before enabling purchases."
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/webhooks/stripe") {
    json(res, 503, {
      success: false,
      error: "Stripe webhooks are disabled because signature verification and payment reconciliation are not implemented."
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/batch/jobs") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    const job = buildBatchJob(body);
    job.userId = context.user.id;
    await store.add("batchJobs", job, { limit: 500 });
    await appendEvent(store, "batch.created", { userId: context.user.id, jobId: job.id, cards: job.cards.length });
    json(res, 201, { success: true, job });
    return;
  }

  if (req.method === "GET" && pathname === "/api/batch/jobs") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const jobs = (await store.list("batchJobs")).filter((item) => item.userId === context.user.id);
    json(res, 200, { success: true, jobs });
    return;
  }

  const batchJobDetailMatch = pathname.match(/^\/api\/batch\/jobs\/([^/]+)$/);
  if (req.method === "GET" && batchJobDetailMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const jobs = await store.list("batchJobs");
    const job = jobs.find((item) => item.id === batchJobDetailMatch[1] && item.userId === context.user.id);
    if (!job) {
      json(res, 404, { success: false, error: "Batch job not found" });
      return;
    }
    json(res, 200, { success: true, job });
    return;
  }

  const batchJobStartMatch = pathname.match(/^\/api\/batch\/jobs\/([^/]+)\/start$/);
  if (req.method === "POST" && batchJobStartMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const job = await updateBatchJob(store, batchJobStartMatch[1], context.user.id, (item) => {
      item.status = item.aiHandoffApproved ? "running" : "blocked";
      item.startedAt = item.startedAt || nowIso();
    });
    if (!job) {
      json(res, 404, { success: false, error: "Batch job not found" });
      return;
    }
    await appendEvent(store, "batch.started", { userId: context.user.id, jobId: job.id });
    json(res, 200, { success: true, job });
    return;
  }

  const batchJobMatch = pathname.match(/^\/api\/batch\/jobs\/([^/]+)\/run$/);
  if (req.method === "POST" && batchJobMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const jobs = await store.list("batchJobs");
    const job = jobs.find((item) => item.id === batchJobMatch[1] && item.userId === context.user.id);
    if (!job) {
      json(res, 404, { success: false, error: "Batch job not found" });
      return;
    }
    await appendEvent(store, "batch.run_blocked", {
      userId: context.user.id,
      jobId: job.id,
      reason: "The backend must not fabricate card analysis or completion."
    });
    json(res, 409, {
      success: false,
      error: "Server-side batch execution is not available. Use the reviewed Power-Up workflow to analyze each card and sync its real result.",
      job
    });
    return;
  }

  const batchJobStatusMatch = pathname.match(/^\/api\/batch\/jobs\/([^/]+)\/status$/);
  if (req.method === "POST" && batchJobStatusMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    const job = await updateBatchJob(store, batchJobStatusMatch[1], context.user.id, (item) => {
      if (body.status !== undefined) {
        const requestedStatus = String(body.status || "").trim();
        if (!BATCH_EDITABLE_JOB_STATUSES.has(requestedStatus)) {
          throw batchValidationError("Batch terminal status is derived from recorded card outcomes and cannot be set directly.");
        }
        item.status = requestedStatus;
      }
      if (body.summary) item.summary = String(body.summary);
      if (body.finishedAt) item.finishedAt = String(body.finishedAt);
    });
    if (!job) {
      json(res, 404, { success: false, error: "Batch job not found" });
      return;
    }
    json(res, 200, { success: true, job });
    return;
  }

  const batchJobCardMatch = pathname.match(/^\/api\/batch\/jobs\/([^/]+)\/cards\/([^/]+)$/);
  if (req.method === "POST" && batchJobCardMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    const job = await updateBatchJob(store, batchJobCardMatch[1], context.user.id, (item) => {
      const card = (item.cards || []).find((entry) => entry.id === batchJobCardMatch[2]);
      if (!card) return;
      validateBatchCardUpdate(card, body);
      if (body.status !== undefined) card.status = String(body.status);
      if (body.error !== undefined) card.error = body.error ? String(body.error) : null;
      if (body.result !== undefined) card.result = clone(body.result);
      if (body.attemptsDelta !== undefined) card.attempts = Math.max(0, Number(card.attempts || 0) + Number(body.attemptsDelta || 0));
      if (body.queuePosition !== undefined) card.queuePosition = Number(body.queuePosition || card.queuePosition || 0);
      card.updatedAt = nowIso();
    });
    if (!job) {
      json(res, 404, { success: false, error: "Batch job not found" });
      return;
    }
    const card = job.cards.find((entry) => entry.id === batchJobCardMatch[2]);
    if (!card) {
      json(res, 404, { success: false, error: "Batch card not found" });
      return;
    }
    await appendEvent(store, "batch.card_updated", {
      userId: context.user.id,
      jobId: job.id,
      cardId: card.id,
      status: card.status
    });
    json(res, 200, { success: true, job, card });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/system/health") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const snapshot = await store.snapshot();
    json(res, 200, {
      success: true,
      status: "ok",
      readiness: config.backendReadiness(),
      eventsTracked: snapshot.events.length,
      transactionsTracked: snapshot.transactions.length,
      batchJobsTracked: snapshot.batchJobs.length
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/dashboard/metrics") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const snapshot = await store.snapshot();
    json(res, 200, {
      success: true,
      metrics: {
        users: snapshot.users.length,
        transactions: snapshot.transactions.length,
        summaries: snapshot.summaries.length,
        reviews: snapshot.reviews.length,
        events: snapshot.events.length,
        batchJobs: snapshot.batchJobs.length
      }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/dashboard/realtime") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const sessions = await store.list("sessions");
    const events = await store.list("events");
    const alerts = await store.list("systemAlerts");
    json(res, 200, {
      success: true,
      realtime: {
        activeTokens: sessions.filter((item) => isActiveSession(item)).length,
        recentEvents: events.slice(0, 10),
        alertsOpen: alerts.filter((item) => !item.acknowledged).length
      }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/users") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const pagination = parsePagination(requestUrl.searchParams);
    const result = paginate((await store.listUsers()).map(cleanUser), pagination.limit, pagination.offset);
    json(res, 200, Object.assign({ success: true, users: result.items }, result));
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/users/stats") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const users = await store.listUsers();
    const totalCredits = users.reduce((sum, item) => sum + Number(item.credits || 0), 0);
    json(res, 200, {
      success: true,
      stats: {
        totalUsers: users.length,
        totalCredits,
        averageCredits: users.length ? Number((totalCredits / users.length).toFixed(2)) : 0
      }
    });
    return;
  }

  const userDetailMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userDetailMatch && req.method === "GET") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const user = await store.findUserById(userDetailMatch[1]);
    if (!user) {
      json(res, 404, { success: false, error: "User not found" });
      return;
    }
    json(res, 200, { success: true, user: cleanUser(user) });
    return;
  }

  if (userDetailMatch && req.method === "PUT") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const updates = {};
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        json(res, 400, { success: false, error: "A valid email address is required" });
        return;
      }
      const existing = await store.findUserByEmail(email);
      if (existing && existing.id !== userDetailMatch[1]) {
        json(res, 409, { success: false, error: "Email already exists" });
        return;
      }
      updates.email = email;
    }
    if (body.name !== undefined) updates.name = String(body.name);
    if (body.role !== undefined) {
      json(res, 422, {
        success: false,
        error: "User roles are not mutable through this endpoint; admin authority is granted only by the separate admin session flow."
      });
      return;
    }
    const user = await store.updateUser(userDetailMatch[1], updates);
    if (!user) {
      json(res, 404, { success: false, error: "User not found" });
      return;
    }
    await appendEvent(store, "admin.user_updated", { userId: user.id });
    json(res, 200, { success: true, user: cleanUser(user) });
    return;
  }

  if (userDetailMatch && req.method === "DELETE") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const user = await store.deleteUser(userDetailMatch[1]);
    if (!user) {
      json(res, 404, { success: false, error: "User not found" });
      return;
    }
    await appendEvent(store, "admin.user_deleted", { userId: user.id });
    json(res, 200, { success: true, user: cleanUser(user) });
    return;
  }

  const userActivityMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/activity$/);
  if (req.method === "GET" && userActivityMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const events = (await store.list("events")).filter((item) => item.payload && item.payload.userId === userActivityMatch[1]);
    json(res, 200, { success: true, activities: events });
    return;
  }

  const userSuspendMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/suspend$/);
  if (req.method === "POST" && userSuspendMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const user = await store.updateUser(userSuspendMatch[1], { suspended: true, suspensionReason: String(body.reason || "") });
    if (!user) {
      json(res, 404, { success: false, error: "User not found" });
      return;
    }
    await appendEvent(store, "admin.user_suspended", { userId: user.id, reason: user.suspensionReason });
    json(res, 200, { success: true, user: cleanUser(user), suspended: true });
    return;
  }

  const userUnsuspendMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/unsuspend$/);
  if (req.method === "POST" && userUnsuspendMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const user = await store.updateUser(userUnsuspendMatch[1], { suspended: false, suspensionReason: "" });
    if (!user) {
      json(res, 404, { success: false, error: "User not found" });
      return;
    }
    await appendEvent(store, "admin.user_unsuspended", { userId: user.id });
    json(res, 200, { success: true, user: cleanUser(user), suspended: false });
    return;
  }

  const userCreditsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits$/);
  if (req.method === "GET" && userCreditsMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const user = await store.findUserById(userCreditsMatch[1]);
    if (!user) {
      json(res, 404, { success: false, error: "User not found" });
      return;
    }
    json(res, 200, { success: true, credits: Number(user.credits || 0), user: cleanUser(user) });
    return;
  }

  const userCreditAdjustMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/adjust$/);
  if (req.method === "POST" && userCreditAdjustMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      json(res, 400, { success: false, error: "A non-zero numeric credit adjustment amount is required" });
      return;
    }
    const response = await withIdempotency(req, store, `admin-credit:${userCreditAdjustMatch[1]}`, async () => {
      const user = await store.findUserById(userCreditAdjustMatch[1]);
      if (!user) return { status: 404, payload: { success: false, error: "User not found" } };
      const updatedUser = await store.updateUser(user.id, { credits: Number(user.credits || 0) + amount });
      const transaction = await store.add("transactions", {
        id: createId("txn"),
        userId: user.id,
        type: "admin_credit_adjustment",
        credits: amount,
        status: "completed",
        reason: String(body.reason || "manual admin adjustment"),
        createdAt: nowIso()
      }, { limit: 1000 });
      await appendEvent(store, "admin.credits_adjusted", {
        userId: user.id,
        before: Number(user.credits || 0),
        after: Number(updatedUser.credits || 0),
        amount
      });
      return { status: 200, payload: { success: true, user: cleanUser(updatedUser), transaction } };
    });
    json(res, response.status, response.payload);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/transactions") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const transactions = await store.list("transactions");
    json(res, 200, { success: true, transactions });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/credits/bulk-adjust") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const adjustments = Array.isArray(body.adjustments) ? body.adjustments : [];
    const results = [];
    for (const adjustment of adjustments) {
      const user = await store.findUserById(adjustment.userId);
      if (!user) {
        results.push({ userId: adjustment.userId, success: false, error: "User not found" });
        continue;
      }
      const amount = Number(adjustment.amount || 0);
      const updated = await store.updateUser(user.id, { credits: Number(user.credits || 0) + amount });
      await store.add("transactions", {
        id: createId("txn"),
        userId: user.id,
        type: "admin_credit_adjustment",
        credits: amount,
        status: "completed",
        reason: String(adjustment.reason || "bulk adjustment"),
        createdAt: nowIso()
      }, { limit: 1000 });
      results.push({ userId: user.id, success: true, credits: updated.credits });
    }
    await appendEvent(store, "admin.bulk_credits_adjusted", { count: results.length });
    json(res, 200, { success: true, results });
    return;
  }

  const transactionReviewMatch = pathname.match(/^\/api\/admin\/transactions\/([^/]+)\/review$/);
  if (req.method === "POST" && transactionReviewMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const review = await store.add("reviews", {
      id: createId("review"),
      transactionId: transactionReviewMatch[1],
      notes: String(body.notes || ""),
      createdAt: nowIso()
    }, { limit: 500 });
    await appendEvent(store, "transaction.reviewed", { transactionId: transactionReviewMatch[1], reviewId: review.id });
    json(res, 200, { success: true, review });
    return;
  }

  const transactionRefundMatch = pathname.match(/^\/api\/admin\/transactions\/([^/]+)\/refund$/);
  if (req.method === "POST" && transactionRefundMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const transactions = await store.list("transactions");
    const original = transactions.find((item) => item.id === transactionRefundMatch[1]);
    if (!original) {
      json(res, 404, { success: false, error: "Transaction not found" });
      return;
    }
    await appendEvent(store, "transaction.refund_blocked", {
      transactionId: original.id,
      reason: "No verified payment processor reconciliation is implemented."
    });
    json(res, 503, {
      success: false,
      error: "Refunds are unavailable because this backend cannot verify or execute a payment-provider refund.",
      nextAction: "Process the refund in the payment provider and record any corresponding credit adjustment separately."
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/settings") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const settings = await store.getSettings();
    json(res, 200, { success: true, settings });
    return;
  }

  if (req.method === "PUT" && pathname === "/api/admin/settings") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const settings = await store.updateSettings({
      providerMode: body.providerMode !== undefined ? String(body.providerMode) : undefined,
      proxyEndpoint: body.proxyEndpoint !== undefined ? String(body.proxyEndpoint) : undefined
    });
    await appendEvent(store, "settings.updated", { providerMode: settings.providerMode });
    json(res, 200, { success: true, settings });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/settings/history") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, history: await store.list("settingsHistory") });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/analytics") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, analytics: await buildAnalytics(store) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/analytics/users") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const users = await store.listUsers();
    json(res, 200, { success: true, users: users.map(cleanUser) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/analytics/revenue") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const transactions = await store.list("transactions");
    json(res, 200, {
      success: true,
      revenue: {
        totalTransactions: transactions.length,
        purchases: transactions.filter((item) => item.type === "credit_purchase")
      }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/analytics/usage") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const summaries = await store.list("summaries");
    json(res, 200, { success: true, usage: { summaries } });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/reports/generate") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const report = await store.add("reports", {
      id: createId("report"),
      type: body.type || "usage",
      parameters: clone(body.parameters || {}),
      createdAt: nowIso(),
      content: {
        generatedAt: nowIso(),
        analytics: await buildAnalytics(store)
      }
    }, { limit: 200 });
    json(res, 200, { success: true, report });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/reports") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, reports: await store.list("reports") });
    return;
  }

  const reportDownloadMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/download$/);
  if (req.method === "GET" && reportDownloadMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const report = (await store.list("reports")).find((item) => item.id === reportDownloadMatch[1]);
    if (!report) {
      json(res, 404, { success: false, error: "Report not found" });
      return;
    }
    json(res, 200, { success: true, report });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/backup/create") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    await appendEvent(store, "backup.create_blocked", {
      reason: "No restorable snapshot mechanism is implemented."
    });
    json(res, 503, {
      success: false,
      error: "Backups are unavailable because this backend cannot create and verify a restorable snapshot."
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/backup/list") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, backups: await store.list("backups") });
    return;
  }

  const backupRestoreMatch = pathname.match(/^\/api\/admin\/backup\/([^/]+)\/restore$/);
  if (req.method === "POST" && backupRestoreMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    await appendEvent(store, "backup.restore_blocked", {
      backupId: backupRestoreMatch[1],
      reason: "No restorable snapshot mechanism is implemented."
    });
    json(res, 503, {
      success: false,
      error: "Backup restore is unavailable because this backend cannot validate or restore a snapshot."
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/maintenance/schedule") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const window = await store.add("maintenanceWindows", {
      id: createId("maintenance"),
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      note: String(body.note || "")
    }, { limit: 100 });
    json(res, 200, { success: true, window });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/maintenance/windows") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, windows: await store.list("maintenanceWindows") });
    return;
  }

  const restartServiceMatch = pathname.match(/^\/api\/admin\/system\/services\/([^/]+)\/restart$/);
  if (req.method === "POST" && restartServiceMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    await appendEvent(store, "system.service_restart_blocked", {
      service: restartServiceMatch[1],
      reason: "No service-control integration is configured."
    });
    json(res, 503, {
      success: false,
      error: "Service restart is unavailable because this backend has no verified service-control integration."
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/system/alerts") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, alerts: await store.list("systemAlerts") });
    return;
  }

  const acknowledgeAlertMatch = pathname.match(/^\/api\/admin\/system\/alerts\/([^/]+)\/acknowledge$/);
  if (req.method === "POST" && acknowledgeAlertMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const alerts = await store.list("systemAlerts");
    const alert = alerts.find((item) => item.id === acknowledgeAlertMatch[1]);
    if (!alert) {
      json(res, 404, { success: false, error: "Alert not found" });
      return;
    }
    alert.acknowledged = true;
    alert.acknowledgedAt = nowIso();
    await store.replace("systemAlerts", alerts);
    json(res, 200, { success: true, alert });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/audit") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, events: (await store.list("events")).slice(0, 100), reviews: (await store.list("reviews")).slice(0, 100) });
    return;
  }

  text(res, 404, "Not Found");
}

async function createBackendApp(options = {}) {
  const normalizedOptions = normalizeBackendStoreOptions(options);
  const store = normalizedOptions.store || await createBackendStore({
    storeType: normalizedOptions.storeType,
    filePath: normalizedOptions.filePath
  });

  const readiness = config.backendReadiness();
  if (!readiness.ok) {
    for (const name of readiness.missing) {
      await appendAlert(store, "high", `Required backend environment variable is missing: ${name}`, "startup");
    }
  }
  if (!config.TRELLO_APP_KEY) {
    await appendAlert(store, "medium", "TRELLO_APP_KEY is not configured; Trello authorization and signed REST calls cannot complete.", "startup");
  }

  return {
    store,
    async handle(req, res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      const origin = String(req.headers.origin || "").trim();
      if (origin && !config.isAllowedBackendOrigin(origin)) {
        json(res, 403, { success: false, error: "Origin is not allowed to access this backend." });
        return;
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
        res.setHeader("Access-Control-Max-Age", "86400");
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        await route(req, res, store);
      } catch (error) {
        const status = Number(error && error.statusCode);
        const clientError = status >= 400 && status < 500;
        if (!clientError) {
          await appendAlert(store, "high", error.message, "runtime");
        }
        json(res, clientError ? status : 500, {
          success: false,
          error: clientError ? error.message : "Internal server error"
        });
      }
    }
  };
}

module.exports = {
  createBackendApp
};
