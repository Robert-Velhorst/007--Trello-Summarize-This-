const crypto = require("node:crypto");
const { buildLocalSummary } = require("./backend-summary");
const { URL } = require("node:url");
const config = require("./backend-config");
const { createBackendStore, createId, normalizeBackendStoreOptions } = require("./backend-storage");
const { buildSupportBundle } = require("./backend-support");

const BODY_LIMIT = 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const HAI_FEED_MAX_BYTES = 1536 * 1024;
const RATE_LIMIT_BUCKET_SOFT_MAX = 4096;
const RATE_LIMIT_BUCKET_HARD_MAX = 8192;
const rateLimitBucketsByStore = new WeakMap();
const BATCH_CARD_STATUSES = new Set(["pending", "opened", "running", "retry-wait", "analyzed", "copied", "skipped", "blocked", "failed"]);
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
  const body = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
  res.end(body);
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
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), actualSalt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve({ salt: actualSalt, hash: derivedKey.toString("hex") });
    });
  });
}

function haiTokenHash(token) {
  return crypto.createHmac("sha256", String(config.JWT_SECRET || ""))
    .update(`hai-connector:${String(token || "")}`)
    .digest("hex");
}

function sanitizeTrelloSourceUri(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "trello.com") return "";
    if (!/^\/c\/[A-Za-z0-9]+(?:\/[^/?#]*)?$/.test(parsed.pathname)) return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function connectorCursor(summary) {
  return `${String(summary.haiApprovedAt || "")}|${String(summary.id || "")}`;
}

function truncateUtf8(value, maxBytes) {
  const textValue = String(value || "");
  if (Buffer.byteLength(textValue, "utf8") <= maxBytes) return textValue;
  let low = 0;
  let high = textValue.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(textValue.slice(0, middle), "utf8") <= maxBytes) low = middle;
    else high = middle - 1;
  }
  const safeEnd = low > 0 && /[\uD800-\uDBFF]/.test(textValue[low - 1]) ? low - 1 : low;
  return textValue.slice(0, safeEnd);
}

async function verifyPassword(password, record) {
  if (!record || !record.hash || !record.salt) return false;
  const candidate = await scryptRecord(password, record.salt);
  const candidateBuffer = Buffer.from(candidate.hash, "hex");
  const storedBuffer = Buffer.from(record.hash, "hex");
  return candidateBuffer.length === storedBuffer.length && crypto.timingSafeEqual(candidateBuffer, storedBuffer);
}

function registrationPasswordError(password) {
  const length = String(password || "").length;
  if (length < 12) return "Password must contain at least 12 characters";
  if (length > 256) return "Password must contain no more than 256 characters";
  return "";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        tooLarge = true;
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
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

function providerMode(payload) {
  if (payload && payload.proxy && payload.proxy.enabled) return "proxy";
  if (payload && payload.provider && payload.provider.apiKey) return "direct-provider";
  return "local";
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

function queryCollection(items, searchParams, searchableFields = []) {
  const query = String(searchParams.get("q") || "").trim().toLowerCase();
  const status = String(searchParams.get("status") || "").trim().toLowerCase();
  const sort = String(searchParams.get("sort") || "");
  const [sortField, sortDirection] = sort.split(":");
  let filtered = items;
  if (query) {
    filtered = filtered.filter((item) => searchableFields.some((field) => String(item[field] || "").toLowerCase().includes(query)));
  }
  if (status) filtered = filtered.filter((item) => String(item.status || "").toLowerCase() === status);
  if (sortField) {
    filtered = filtered.slice().sort((left, right) => {
      const comparison = String(left[sortField] || "").localeCompare(String(right[sortField] || ""));
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }
  const pagination = parsePagination(searchParams);
  return paginate(filtered, pagination.limit, pagination.offset);
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
  const now = Date.now();
  let buckets = rateLimitBucketsByStore.get(store);
  if (!buckets) {
    buckets = new Map();
    rateLimitBucketsByStore.set(store, buckets);
  }
  if (buckets.size > RATE_LIMIT_BUCKET_SOFT_MAX) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.expiresAt <= now) buckets.delete(bucketKey);
    }
  }
  const bucketKey = `${String(scope)}\u0000${String(key)}`;
  let bucket = buckets.get(bucketKey);
  if (bucket && bucket.expiresAt <= now) {
    buckets.delete(bucketKey);
    bucket = null;
  }
  if (!bucket && buckets.size >= RATE_LIMIT_BUCKET_HARD_MAX) {
    return { ok: false, retryAfterSeconds: 1 };
  }
  if (!bucket) {
    bucket = { count: 0, expiresAt: now + windowMs };
  }
  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000))
    };
  }
  bucket.count += 1;
  buckets.delete(bucketKey);
  buckets.set(bucketKey, bucket);
  return { ok: true, retryAfterSeconds: 0 };
}

function clientAddress(req) {
  const address = req && req.socket && req.socket.remoteAddress;
  return String(address || "unknown-client").trim().slice(0, 128) || "unknown-client";
}

function hasForwardingHeaders(req) {
  const headers = (req && req.headers) || {};
  return ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"]
    .some((name) => Boolean(String(headers[name] || "").trim()));
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
  const requestedMode = String(body.executionMode || "manual-reviewed");
  const executionMode = requestedMode === "local-worker" ? "local-worker" : "manual-reviewed";
  return {
    id: createId("batch"),
    listName: String(body.listName || "").slice(0, 120),
    source: String(body.source || "popup-reviewed-batch").slice(0, 120),
    status: "queued",
    cards: cards.map((item, index) => {
      const requestedId = String(item.id || item.cardId || "");
      return {
        id: /^[A-Za-z0-9_-]{1,100}$/.test(requestedId) ? requestedId : `card-${index + 1}`,
        name: String(item.name || `Card ${index + 1}`).slice(0, 200),
        inputText: String(item.inputText || "").slice(0, 100_000),
        status: "pending",
        queuePosition: Number(item.queuePosition || index + 1),
        attempts: 0,
        result: null,
        error: null
      };
    }),
    concurrency: Math.max(1, Math.min(3, Number(body.concurrency || 1) || 1)),
    delaySeconds: Math.max(0, Math.min(30, Number(body.delaySeconds || 0) || 0)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    trelloWriteDefault: "off",
    approvalRequired: true,
    aiHandoffApproved: Boolean(body.aiHandoffApproved),
    executionMode,
    executionApproved: executionMode === "local-worker" && body.executionApproved === true,
    maxAttempts: Math.max(1, Math.min(5, Number(body.maxAttempts || 3))),
    nextAttemptAt: null,
    leaseExpiresAt: null,
    workerId: null
  };
}

function validateReviewedSummaryPayload(payload) {
  if (!payload || payload.reviewed !== true) return "Saving requires reviewed=true after the exact summary has been reviewed.";
  const title = String(payload.title || "").trim();
  const content = String(payload.content || "").trim();
  if (!title) return "A summary title is required.";
  if (!content) return "Summary content is required.";
  if (title.length > 300) return "Summary title must contain no more than 300 characters.";
  if (content.length > 100_000) return "Summary content must contain no more than 100000 characters.";
  if (payload.sourceUri && !sanitizeTrelloSourceUri(payload.sourceUri)) return "Only a normal https://trello.com/c/... source link is accepted.";
  return "";
}

function cleanSummaryForUser(summary) {
  return {
    id: summary.id,
    title: summary.title || "Reviewed Trello summary",
    summary: summary.summary,
    sourceUri: summary.sourceUri || "",
    cardId: summary.cardId || "",
    runId: summary.runId || "",
    method: summary.method,
    providerMode: summary.providerMode,
    confidence: summary.confidence,
    reviewedAt: summary.reviewedAt || null,
    haiApprovedAt: summary.haiApprovedAt || null,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt
  };
}

async function workspaceAccess(store, userId, workspaceId) {
  const membership = (await store.list("memberships")).find((item) => item.userId === userId && item.workspaceId === workspaceId);
  return membership || null;
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
  if (cards.some((item) => item.status === "retry-wait")) return "retry-wait";
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

async function route(req, res, store, adminPasswordRecord) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${config.HOST}:${config.PORT}`}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    const snapshot = await store.snapshot();
    const storageHealth = typeof store.databaseHealth === "function"
      ? await store.databaseHealth().catch((error) => ({ ok: false, kind: "postgres", error: error.message }))
      : { ok: true, kind: "local" };
    json(res, storageHealth.ok ? 200 : 503, {
      status: storageHealth.ok ? "ok" : "degraded",
      service: "summarize-this-backend",
      version: require("./package.json").version,
      timestamp: nowIso(),
      storage: {
        kind: storageHealth.kind,
        latencyMs: storageHealth.latencyMs,
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
    const storageHealth = typeof store.databaseHealth === "function"
      ? await store.databaseHealth().catch((error) => ({ ok: false, kind: "postgres", error: error.message }))
      : { ok: true, kind: "local" };
    const ready = readiness.ok && storageHealth.ok;
    json(res, ready ? 200 : 503, {
      status: ready ? "ready" : "blocked",
      missing: readiness.missing,
      optional: readiness.optional,
      storage: storageHealth
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/config") {
    json(res, 200, config.publicConfig());
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    if (config.REGISTRATION_MODE === "closed") {
      json(res, 403, { success: false, error: "Account registration is closed on this backend" });
      return;
    }
    if (config.REGISTRATION_MODE === "single-user") {
      if (hasForwardingHeaders(req)) {
        json(res, 403, { success: false, error: "Create the owner account from the installed app on the host computer before opening a public tunnel" });
        return;
      }
      if ((await store.listUsers()).length > 0) {
        json(res, 403, { success: false, error: "This backend already has its owner account; additional registration is disabled" });
        return;
      }
    }
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
    const passwordError = registrationPasswordError(body.password);
    if (passwordError) {
      json(res, 400, { success: false, error: passwordError });
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
    const passwordRecord = await scryptRecord(body.password);
    const createUser = config.REGISTRATION_MODE === "single-user"
      ? store.createFirstUser.bind(store)
      : store.createUser.bind(store);
    const user = await createUser({
      email,
      name: String(body.name).trim().slice(0, 120),
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
    const passwordRecord = user
      ? { hash: user.passwordHash, salt: user.passwordSalt }
      : { hash: "0".repeat(128), salt: "missing-user-timing-salt" };
    const passwordValid = await verifyPassword(body.password, passwordRecord);
    if (!user || !passwordValid || user.suspended) {
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
    if (email !== String(config.ADMIN_EMAIL).trim().toLowerCase() || !await verifyPassword(password, adminPasswordRecord)) {
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

  const haiFeedMatch = pathname.match(/^\/api\/integrations\/hai\/feed\/(hai_[A-Za-z0-9_-]{32,})$/);
  if (req.method === "GET" && haiFeedMatch) {
    if (!config.HAI_CONNECTOR_ENABLED) {
      text(res, 404, "Not Found");
      return;
    }
    const connectorHash = haiTokenHash(haiFeedMatch[1]);
    const token = (await store.list("haiTokens")).find((item) => item.tokenHash === connectorHash && !item.revokedAt);
    if (!token) {
      text(res, 404, "Not Found");
      return;
    }
    const limitResult = await checkRateLimit(store, "hai.feed", token.userId, 120, 60 * 60_000);
    if (!limitResult.ok) {
      json(res, 429, { error: "HAI feed rate limit exceeded", retryAfterSeconds: limitResult.retryAfterSeconds });
      return;
    }
    const requestedCursor = String(requestUrl.searchParams.get("cursor") || "").slice(0, 300);
    const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get("limit") || 100) || 100));
    const approved = (await store.list("summaries"))
      .filter((item) => item.userId === token.userId && item.haiApprovedAt && connectorCursor(item) > requestedCursor)
      .sort((left, right) => connectorCursor(left).localeCompare(connectorCursor(right)));
    const page = approved.slice(0, limit);
    const items = page.map((item) => ({
      externalId: `summarize-this:${item.id}`,
      title: String(item.title || "Reviewed Trello summary").slice(0, 300),
      content: truncateUtf8(item.summary, 100_000),
      sourceUri: sanitizeTrelloSourceUri(item.sourceUri),
      itemType: "card",
      provider: "trello",
      accountLabel: "summarize-this",
      projectKey: String(item.projectKey || "trello-summaries").slice(0, 120),
      receivedAt: item.haiApprovedAt
    }));
    while (items.length > 1) {
      const candidateCursor = connectorCursor(page[items.length - 1]);
      if (Buffer.byteLength(JSON.stringify({ items, cursor: candidateCursor, nextCursor: candidateCursor }), "utf8") <= HAI_FEED_MAX_BYTES) break;
      items.pop();
    }
    const responseCursor = items.length
      ? connectorCursor(page[items.length - 1])
      : requestedCursor;
    await store.updateRecord("haiTokens", token.id, (record) => {
      record.lastUsedAt = nowIso();
    });
    json(res, 200, {
      items,
      cursor: responseCursor,
      nextCursor: responseCursor
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/user/data-export") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const exported = await store.exportUserData(context.user.id);
    json(res, 200, { success: true, exportedAt: nowIso(), data: exported });
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/user/profile") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    if (!(await verifyPassword(body.password, { hash: context.user.passwordHash, salt: context.user.passwordSalt }))) {
      json(res, 403, { success: false, error: "Current password confirmation is required" });
      return;
    }
    const deleted = await store.deleteUserCascade(context.user.id);
    json(res, 200, { success: true, deleted: Boolean(deleted), removed: deleted && deleted.removed });
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
    const events = (await store.list("events")).filter((item) => item.payload && item.payload.userId === context.user.id);
    const result = queryCollection(events, requestUrl.searchParams, ["type"]);
    json(res, 200, Object.assign({ success: true, activities: result.items }, result));
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
      const settings = await store.getSettings();
      const creditCost = settings.billingMode === "enabled" ? 5 : 0;
      if (creditCost > 0 && Number(current.credits || 0) < creditCost) {
        return { status: 402, payload: { success: false, error: "Insufficient credits" } };
      }
      const updatedUser = creditCost > 0
        ? await store.updateUser(current.id, { credits: Number(current.credits || 0) - creditCost })
        : current;
      const localResult = buildLocalSummary(body.text, { source: "submitted text" });
      const summary = await store.add("summaries", {
        id: createId("summary"),
        userId: current.id,
        workspaceId: current.workspaceId,
        summary: localResult.summary,
        method: ["hybrid", "extractive", "abstractive"].includes(String(body.method)) ? String(body.method) : "hybrid",
        providerMode: localResult.providerMode,
        confidence: localResult.confidence,
        heuristicConfidence: localResult.heuristicConfidence,
        measuredEvaluation: localResult.measuredEvaluation,
        evidence: localResult.evidence,
        guardrails: localResult.guardrails,
        creditsUsed: creditCost,
        createdAt: nowIso()
      }, { limit: 1000 });
      if (creditCost > 0) {
        await store.add("transactions", {
          id: createId("txn"),
          userId: current.id,
          type: "summary_charge",
          credits: -creditCost,
          status: "completed",
          createdAt: nowIso()
        }, { limit: 1000 });
      }
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
    if (!job.cards.length || job.cards.length > 100) {
      json(res, 400, { success: false, error: "A batch must contain between 1 and 100 cards" });
      return;
    }
    if (new Set(job.cards.map((card) => card.id)).size !== job.cards.length) {
      json(res, 400, { success: false, error: "Batch card IDs must be unique" });
      return;
    }
    if (job.executionMode === "local-worker" && job.cards.some((card) => card.inputText.trim().length < 50)) {
      json(res, 400, { success: false, error: "Every local-worker card requires at least 50 characters of explicit source text" });
      return;
    }
    job.userId = context.user.id;
    job.workspaceId = context.user.workspaceId;
    const response = await withIdempotency(req, store, `batch-create:${context.user.id}`, async () => {
      await store.add("batchJobs", job, { limit: 500 });
      await appendEvent(store, "batch.created", { userId: context.user.id, jobId: job.id, cards: job.cards.length, executionMode: job.executionMode });
      return { status: 201, payload: { success: true, job } };
    });
    json(res, response.status, response.payload);
    return;
  }

  if (req.method === "GET" && pathname === "/api/summaries") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const summaries = (await store.list("summaries")).filter((item) => item.userId === context.user.id);
    const result = queryCollection(summaries, requestUrl.searchParams, ["id", "title", "cardId", "runId"]);
    json(res, 200, Object.assign({ success: true, summaries: result.items.map(cleanSummaryForUser) }, result));
    return;
  }

  if (req.method === "POST" && pathname === "/api/summaries/reviewed") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const limited = await checkRateLimit(store, "summaries.reviewed", context.user.id, 60, 60 * 60_000);
    if (!limited.ok) {
      json(res, 429, { success: false, error: "Reviewed-summary rate limit exceeded", retryAfterSeconds: limited.retryAfterSeconds });
      return;
    }
    const body = await readBody(req);
    const validationError = validateReviewedSummaryPayload(body);
    if (validationError) {
      json(res, 400, { success: false, error: validationError });
      return;
    }
    const sourceUri = sanitizeTrelloSourceUri(body.sourceUri);
    const runId = String(body.runId || "").trim().slice(0, 160);
    const response = await withIdempotency(req, store, `reviewed-summary:${context.user.id}`, async () => {
      const existing = runId
        ? (await store.list("summaries")).find((item) => item.userId === context.user.id && item.runId === runId)
        : null;
      if (existing) {
        const updated = body.haiApproved === true && !existing.haiApprovedAt
          ? await store.updateRecord("summaries", existing.id, (record) => { record.haiApprovedAt = nowIso(); })
          : existing;
        return { status: 200, payload: { success: true, summary: cleanSummaryForUser(updated), existing: true } };
      }
      const summary = await store.add("summaries", {
        id: createId("summary"),
        userId: context.user.id,
        workspaceId: context.user.workspaceId,
        title: String(body.title).trim().slice(0, 300),
        summary: String(body.content).trim().slice(0, 100_000),
        sourceUri,
        cardId: String(body.cardId || "").trim().slice(0, 160),
        runId,
        projectKey: String(body.projectKey || "trello-summaries").trim().slice(0, 120),
        method: "reviewed-import",
        providerMode: String(body.providerMode || "local").trim().slice(0, 80),
        confidence: Math.max(0, Math.min(1, Number(body.confidence || 0))),
        reviewedAt: nowIso(),
        haiApprovedAt: body.haiApproved === true ? nowIso() : null,
        creditsUsed: 0
      }, { limit: 1000 });
      await appendEvent(store, "summary.reviewed_saved", {
        userId: context.user.id,
        summaryId: summary.id,
        haiApproved: Boolean(summary.haiApprovedAt)
      });
      return { status: 201, payload: { success: true, summary: cleanSummaryForUser(summary) } };
    });
    json(res, response.status, response.payload);
    return;
  }

  const haiApprovalMatch = pathname.match(/^\/api\/summaries\/([^/]+)\/hai-approval$/);
  if (req.method === "POST" && haiApprovalMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    if (typeof body.approved !== "boolean") {
      json(res, 400, { success: false, error: "approved must be true or false" });
      return;
    }
    const summary = (await store.list("summaries")).find((item) => item.id === haiApprovalMatch[1] && item.userId === context.user.id);
    if (!summary) {
      json(res, 404, { success: false, error: "Summary not found" });
      return;
    }
    const updated = await store.updateRecord("summaries", summary.id, (record) => {
      record.haiApprovedAt = body.approved ? nowIso() : null;
    });
    await appendEvent(store, body.approved ? "summary.hai_approved" : "summary.hai_revoked", {
      userId: context.user.id,
      summaryId: summary.id
    });
    json(res, 200, { success: true, summary: cleanSummaryForUser(updated) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/integrations/hai/status") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const active = (await store.list("haiTokens")).find((item) => item.userId === context.user.id && !item.revokedAt);
    const approvedCount = (await store.list("summaries")).filter((item) => item.userId === context.user.id && item.haiApprovedAt).length;
    json(res, 200, {
      success: true,
      enabled: config.HAI_CONNECTOR_ENABLED,
      configured: Boolean(active),
      createdAt: active ? active.createdAt : null,
      lastUsedAt: active ? active.lastUsedAt || null : null,
      approvedSummaryCount: approvedCount
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/integrations/hai/token") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    if (!config.HAI_CONNECTOR_ENABLED) {
      json(res, 503, { success: false, error: "The HAI connector is disabled on this backend." });
      return;
    }
    const rawToken = `hai_${crypto.randomBytes(32).toString("base64url")}`;
    const records = await store.list("haiTokens");
    records.forEach((item) => {
      if (item.userId === context.user.id && !item.revokedAt) {
        item.revokedAt = nowIso();
        item.updatedAt = item.revokedAt;
      }
    });
    records.unshift({
      id: createId("hai-token"),
      userId: context.user.id,
      tokenHash: haiTokenHash(rawToken),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      revokedAt: null,
      lastUsedAt: null
    });
    await store.replace("haiTokens", records.slice(0, 1000));
    await appendEvent(store, "hai.connector_token_rotated", { userId: context.user.id });
    json(res, 201, {
      success: true,
      token: rawToken,
      feedPath: `/api/integrations/hai/feed/${rawToken}`,
      warning: "This capability URL is shown once. Anyone who has it can read only your HAI-approved summaries until you rotate or revoke it."
    });
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/integrations/hai/token") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const records = await store.list("haiTokens");
    let revoked = 0;
    records.forEach((item) => {
      if (item.userId === context.user.id && !item.revokedAt) {
        item.revokedAt = nowIso();
        item.updatedAt = item.revokedAt;
        revoked += 1;
      }
    });
    await store.replace("haiTokens", records);
    await appendEvent(store, "hai.connector_token_revoked", { userId: context.user.id, revoked });
    json(res, 200, { success: true, revoked });
    return;
  }

  if (req.method === "GET" && pathname === "/api/batch/jobs") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const jobs = (await store.list("batchJobs")).filter((item) => item.userId === context.user.id);
    const result = queryCollection(jobs, requestUrl.searchParams, ["id", "listName", "source"]);
    json(res, 200, Object.assign({ success: true, jobs: result.items }, result));
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
      item.status = item.executionMode === "local-worker" && item.executionApproved ? "queued" : (item.aiHandoffApproved ? "running" : "blocked");
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
    if (job.executionMode !== "local-worker" || !job.executionApproved) {
      await appendEvent(store, "batch.run_blocked", { userId: context.user.id, jobId: job.id, reason: "Explicit local-worker approval is required." });
      json(res, 409, { success: false, error: "This job is not approved for local-worker processing. Use the reviewed Power-Up workflow or create an explicitly approved local-worker job.", job });
      return;
    }
    const queued = await updateBatchJob(store, job.id, context.user.id, (item) => {
      item.status = "queued";
      item.nextAttemptAt = null;
    });
    await appendEvent(store, "batch.enqueued", { userId: context.user.id, jobId: job.id });
    json(res, 202, { success: true, job: queued, reviewRequired: true });
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

  if (req.method === "GET" && pathname === "/api/workspaces") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const memberships = (await store.list("memberships")).filter((item) => item.userId === context.user.id);
    const allowedIds = new Set(memberships.map((item) => item.workspaceId));
    const workspaces = (await store.list("workspaces")).filter((item) => allowedIds.has(item.id)).map((workspace) => ({
      ...workspace,
      role: memberships.find((item) => item.workspaceId === workspace.id).role
    }));
    json(res, 200, { success: true, workspaces });
    return;
  }

  const workspaceMembersMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/members$/);
  if (req.method === "GET" && workspaceMembersMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const access = await workspaceAccess(store, context.user.id, workspaceMembersMatch[1]);
    if (!access) {
      json(res, 403, { success: false, error: "Workspace access denied" });
      return;
    }
    const users = await store.listUsers();
    const members = (await store.list("memberships")).filter((item) => item.workspaceId === workspaceMembersMatch[1]).map((membership) => ({
      ...membership,
      user: cleanUser(users.find((item) => item.id === membership.userId))
    }));
    json(res, 200, { success: true, members });
    return;
  }

  if (req.method === "POST" && workspaceMembersMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const access = await workspaceAccess(store, context.user.id, workspaceMembersMatch[1]);
    if (!access || access.role !== "owner") {
      json(res, 403, { success: false, error: "Only a workspace owner can manage members" });
      return;
    }
    const body = await readBody(req);
    const role = ["editor", "viewer"].includes(String(body.role)) ? String(body.role) : "viewer";
    const invitedUser = await store.findUserByEmail(normalizeEmail(body.email));
    if (!invitedUser) {
      json(res, 404, { success: false, error: "The user must register before being added to a workspace" });
      return;
    }
    const memberships = await store.list("memberships");
    let membership = memberships.find((item) => item.workspaceId === workspaceMembersMatch[1] && item.userId === invitedUser.id);
    if (membership) {
      membership.role = membership.role === "owner" ? "owner" : role;
      membership.updatedAt = nowIso();
      await store.replace("memberships", memberships);
    } else {
      membership = await store.add("memberships", { id: createId("membership"), workspaceId: workspaceMembersMatch[1], userId: invitedUser.id, role });
    }
    await appendEvent(store, "workspace.member_updated", { userId: context.user.id, memberUserId: invitedUser.id, workspaceId: workspaceMembersMatch[1], role: membership.role });
    json(res, 200, { success: true, membership });
    return;
  }

  const workspaceDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (req.method === "PUT" && workspaceDetailMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const access = await workspaceAccess(store, context.user.id, workspaceDetailMatch[1]);
    if (!access || access.role !== "owner") {
      json(res, 403, { success: false, error: "Only a workspace owner can change workspace settings" });
      return;
    }
    const body = await readBody(req);
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) {
      json(res, 400, { success: false, error: "Workspace name is required" });
      return;
    }
    const workspace = await store.updateRecord("workspaces", workspaceDetailMatch[1], (item) => { item.name = name; });
    json(res, 200, { success: true, workspace });
    return;
  }

  const workspaceSummariesMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/summaries$/);
  if (req.method === "GET" && workspaceSummariesMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const access = await workspaceAccess(store, context.user.id, workspaceSummariesMatch[1]);
    if (!access) {
      json(res, 403, { success: false, error: "Workspace access denied" });
      return;
    }
    const summaries = (await store.list("summaries")).filter((item) => item.workspaceId === workspaceSummariesMatch[1]);
    const result = queryCollection(summaries, requestUrl.searchParams, ["id", "method", "providerMode"]);
    json(res, 200, Object.assign({ success: true, summaries: result.items }, result));
    return;
  }

  const workspaceMemberDeleteMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/members\/([^/]+)$/);
  if (req.method === "DELETE" && workspaceMemberDeleteMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const access = await workspaceAccess(store, context.user.id, workspaceMemberDeleteMatch[1]);
    if (!access || access.role !== "owner") {
      json(res, 403, { success: false, error: "Only a workspace owner can manage members" });
      return;
    }
    const memberships = await store.list("memberships");
    const membership = memberships.find((item) => item.workspaceId === workspaceMemberDeleteMatch[1] && item.userId === workspaceMemberDeleteMatch[2]);
    if (!membership) {
      json(res, 404, { success: false, error: "Workspace member not found" });
      return;
    }
    if (membership.role === "owner") {
      json(res, 409, { success: false, error: "The workspace owner cannot be removed" });
      return;
    }
    await store.replace("memberships", memberships.filter((item) => item.id !== membership.id));
    await appendEvent(store, "workspace.member_removed", { userId: context.user.id, memberUserId: membership.userId, workspaceId: membership.workspaceId });
    json(res, 200, { success: true, removed: membership });
    return;
  }

  if (req.method === "POST" && pathname === "/api/reminders") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    const dueAt = Date.parse(String(body.dueAt || ""));
    if (!Number.isFinite(dueAt) || dueAt <= Date.now()) {
      json(res, 400, { success: false, error: "dueAt must be a future ISO date" });
      return;
    }
    const reminder = await store.add("reminders", {
      id: createId("reminder"),
      userId: context.user.id,
      workspaceId: context.user.workspaceId,
      title: String(body.title || "Summarize This reminder").slice(0, 120),
      message: String(body.message || "Review your summarized Trello card.").slice(0, 500),
      dueAt: new Date(dueAt).toISOString(),
      status: "scheduled"
    }, { limit: 1000 });
    json(res, 201, { success: true, reminder });
    return;
  }

  if (req.method === "GET" && pathname === "/api/reminders") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const reminders = (await store.list("reminders")).filter((item) => item.userId === context.user.id);
    const result = queryCollection(reminders, requestUrl.searchParams, ["title", "message"]);
    json(res, 200, Object.assign({ success: true, reminders: result.items }, result));
    return;
  }

  const reminderDeleteMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (req.method === "DELETE" && reminderDeleteMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const reminders = await store.list("reminders");
    const reminder = reminders.find((item) => item.id === reminderDeleteMatch[1] && item.userId === context.user.id);
    if (!reminder) {
      json(res, 404, { success: false, error: "Reminder not found" });
      return;
    }
    reminder.status = "cancelled";
    reminder.updatedAt = nowIso();
    await store.replace("reminders", reminders);
    json(res, 200, { success: true, reminder });
    return;
  }

  if (req.method === "GET" && pathname === "/api/notifications") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const notifications = (await store.list("notifications")).filter((item) => item.userId === context.user.id);
    const result = queryCollection(notifications, requestUrl.searchParams, ["title", "message"]);
    json(res, 200, Object.assign({ success: true, notifications: result.items }, result));
    return;
  }

  const notificationReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (req.method === "POST" && notificationReadMatch) {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const notification = await store.updateRecord("notifications", notificationReadMatch[1], (item) => {
      if (item.userId !== context.user.id) throw batchValidationError("Notification access denied");
      item.status = "read";
      item.readAt = nowIso();
    });
    if (!notification) {
      json(res, 404, { success: false, error: "Notification not found" });
      return;
    }
    json(res, 200, { success: true, notification });
    return;
  }

  if (req.method === "POST" && pathname === "/api/analytics/events") {
    const context = await requireSession(store, req, res, "user");
    if (!context) return;
    const body = await readBody(req);
    const eventName = String(body.name || "");
    const allowed = new Set(["popup_opened", "summary_requested", "summary_reviewed", "summary_copied", "trello_write_approved"]);
    if (!allowed.has(eventName)) {
      json(res, 400, { success: false, error: "Unsupported analytics event" });
      return;
    }
    const event = await store.add("analyticsEvents", { id: createId("analytics"), userId: context.user.id, workspaceId: context.user.workspaceId, name: eventName });
    json(res, 202, { success: true, event: { id: event.id, name: event.name, createdAt: event.createdAt } });
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
    const result = queryCollection((await store.listUsers()).map(cleanUser), requestUrl.searchParams, ["id", "email", "name"]);
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
    if (body.name !== undefined) {
      updates.name = String(body.name).trim().slice(0, 120);
      if (!updates.name) {
        json(res, 400, { success: false, error: "User name cannot be empty" });
        return;
      }
    }
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
    const result = queryCollection(await store.list("transactions"), requestUrl.searchParams, ["id", "userId", "type", "reason"]);
    json(res, 200, Object.assign({ success: true, transactions: result.items }, result));
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/credits/bulk-adjust") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const adjustments = Array.isArray(body.adjustments) ? body.adjustments : [];
    if (!adjustments.length || adjustments.length > 100) {
      json(res, 400, { success: false, error: "Provide between 1 and 100 credit adjustments" });
      return;
    }
    if (adjustments.some((item) => !Number.isFinite(Number(item.amount)) || Number(item.amount) === 0 || Math.abs(Number(item.amount)) > 100_000)) {
      json(res, 400, { success: false, error: "Each adjustment must be a non-zero number between -100000 and 100000" });
      return;
    }
    const response = await withIdempotency(req, store, "admin-bulk-credit", async () => {
      const results = await store.transaction((state) => {
        const applied = [];
        for (const adjustment of adjustments) {
          const user = state.users.find((item) => item.id === adjustment.userId);
          if (!user) {
            applied.push({ userId: adjustment.userId, success: false, error: "User not found" });
            continue;
          }
          const amount = Number(adjustment.amount);
          user.credits = Number(user.credits || 0) + amount;
          user.updatedAt = nowIso();
          state.transactions.unshift({ id: createId("txn"), userId: user.id, type: "admin_credit_adjustment", credits: amount, status: "completed", reason: String(adjustment.reason || "bulk adjustment").slice(0, 500), createdAt: nowIso(), updatedAt: nowIso() });
          applied.push({ userId: user.id, success: true, credits: user.credits });
        }
        state.transactions = state.transactions.slice(0, 1000);
        state.events.unshift({ id: createId("event"), type: "admin.bulk_credits_adjusted", payload: { count: applied.length }, createdAt: nowIso(), updatedAt: nowIso() });
        state.events = state.events.slice(0, 250);
        return applied;
      });
      return { status: 200, payload: { success: true, results } };
    });
    json(res, response.status, response.payload);
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
    if (body.providerMode !== undefined && String(body.providerMode) !== "local") {
      json(res, 422, { success: false, error: "Only local provider mode is available in this backend" });
      return;
    }
    if (body.proxyEndpoint) {
      let endpoint;
      try {
        endpoint = new URL(String(body.proxyEndpoint));
      } catch (_error) {
        json(res, 400, { success: false, error: "proxyEndpoint must be a valid HTTPS URL" });
        return;
      }
      if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
        json(res, 400, { success: false, error: "proxyEndpoint must be an HTTPS URL without embedded credentials" });
        return;
      }
    }
    const settings = await store.updateSettings({
      providerMode: "local",
      proxyEndpoint: body.proxyEndpoint !== undefined ? String(body.proxyEndpoint) : (await store.getSettings()).proxyEndpoint
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
    const result = queryCollection(await store.list("reports"), requestUrl.searchParams, ["id", "type"]);
    json(res, 200, Object.assign({ success: true, reports: result.items }, result));
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
    const body = await readBody(req);
    const response = await withIdempotency(req, store, "admin-backup-create", async () => {
      const backup = await store.createBackup({ reason: String(body.reason || "manual admin backup") });
      await appendEvent(store, "backup.created", { backupId: backup.id, sha256: backup.sha256, verified: backup.verified });
      return { status: 201, payload: { success: true, backup } };
    });
    json(res, response.status, response.payload);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/backup/list") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, backups: await store.list("backups"), scope: "local verified snapshots" });
    return;
  }

  const backupRestoreMatch = pathname.match(/^\/api\/admin\/backup\/([^/]+)\/restore$/);
  if (req.method === "POST" && backupRestoreMatch) {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    if (body.confirm !== true) {
      json(res, 400, { success: false, error: "Restore requires confirm=true" });
      return;
    }
    const knownBackup = (await store.list("backups")).some((item) => item.id === backupRestoreMatch[1]);
    if (!knownBackup) {
      json(res, 404, { success: false, error: "Backup not found" });
      return;
    }
    const safetyBackup = await store.createBackup({ reason: `pre-restore safety snapshot for ${backupRestoreMatch[1]}` });
    const restored = await store.restoreBackup(backupRestoreMatch[1]);
    await appendEvent(store, "backup.restored", { backupId: backupRestoreMatch[1], safetyBackupId: safetyBackup.id });
    json(res, 200, { success: true, restored, safetyBackup });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/data/reconcile") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const result = await store.reconcile({ apply: body.apply === true });
    await appendEvent(store, "data.reconciled", { apply: result.apply, issueCount: result.issues.length, fixCount: result.fixes.length });
    json(res, 200, { success: true, reconciliation: result });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/exceptions") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const jobs = await store.list("batchJobs");
    const alerts = await store.list("systemAlerts");
    const reconciliation = await store.reconcile({ apply: false });
    json(res, 200, {
      success: true,
      exceptions: {
        jobs: jobs.filter((item) => ["needs-attention", "failed", "blocked"].includes(item.status)),
        alerts: alerts.filter((item) => !item.acknowledged),
        dataIssues: reconciliation.issues
      }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/support-bundle") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    json(res, 200, { success: true, bundle: await buildSupportBundle(store, config.backendReadiness()) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/maintenance/schedule") {
    const context = await requireSession(store, req, res, "admin");
    if (!context) return;
    const body = await readBody(req);
    const startsAt = Date.parse(String(body.startsAt || ""));
    const endsAt = Date.parse(String(body.endsAt || ""));
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt || endsAt - startsAt > 7 * 24 * 60 * 60_000) {
      json(res, 400, { success: false, error: "Maintenance window must have valid dates, end after start, and last no more than seven days" });
      return;
    }
    const window = await store.add("maintenanceWindows", {
      id: createId("maintenance"),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      note: String(body.note || "").slice(0, 500)
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
    const result = queryCollection(await store.list("events"), requestUrl.searchParams, ["id", "type"]);
    json(res, 200, Object.assign({ success: true, events: result.items, reviews: (await store.list("reviews")).slice(0, 100) }, result));
    return;
  }

  text(res, 404, "Not Found");
}

async function createBackendApp(options = {}) {
  const normalizedOptions = normalizeBackendStoreOptions(options);
  const store = normalizedOptions.store || await createBackendStore({
    storeType: normalizedOptions.storeType,
    filePath: normalizedOptions.filePath,
    databaseUrl: normalizedOptions.databaseUrl,
    postgresTable: normalizedOptions.postgresTable
  });
  const adminPasswordRecord = await scryptRecord(config.ADMIN_PASSWORD);

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
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, ngrok-skip-browser-warning");
        res.setHeader("Access-Control-Max-Age", "86400");
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        await route(req, res, store, adminPasswordRecord);
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
