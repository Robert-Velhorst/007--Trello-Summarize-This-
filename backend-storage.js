const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");

const DEFAULT_RUNTIME_STORE_PATH = path.join(__dirname, "database", "runtime", "local-backend-store.json");
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function createId(prefix) {
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveBackendFilePath(options = {}) {
  if (options.filePath) return String(options.filePath);
  if (options.storagePath) return String(options.storagePath);
  return DEFAULT_RUNTIME_STORE_PATH;
}

function normalizeBackendStoreOptions(options = {}) {
  return Object.assign({}, options, {
    filePath: resolveBackendFilePath(options)
  });
}

function defaultState() {
  const createdAt = "2026-07-01T00:00:00.000Z";
  return {
    meta: {
      schemaVersion: 1,
      createdAt,
      updatedAt: createdAt
    },
    users: [],
    sessions: [],
    summaries: [],
    transactions: [],
    events: [],
    reviews: [],
    systemAlerts: [],
    settingsHistory: [],
    reports: [],
    backups: [],
    maintenanceWindows: [],
    files: [],
    batchJobs: [],
    idempotencyRecords: [],
    rateLimitWindows: [],
    settings: {
      proxyEndpoint: "",
      providerMode: "local",
      trelloKeyConfigured: false
    }
  };
}

class LocalBackendStore {
  constructor(options = {}) {
    this.filePath = resolveBackendFilePath(options);
    this.state = null;
    this.persistQueue = Promise.resolve();
  }

  async initialize(seedPasswordRecord) {
    const directory = path.dirname(this.filePath);
    const createdDirectory = await fsp.mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    if (this.filePath === DEFAULT_RUNTIME_STORE_PATH || createdDirectory === directory) {
      await fsp.chmod(directory, PRIVATE_DIRECTORY_MODE);
    }
    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw);
      await fsp.chmod(this.filePath, PRIVATE_FILE_MODE);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = defaultState();
    }

    this.state.users = normalizeArray(this.state.users);
    this.state.sessions = normalizeArray(this.state.sessions);
    this.state.summaries = normalizeArray(this.state.summaries);
    this.state.transactions = normalizeArray(this.state.transactions);
    this.state.events = normalizeArray(this.state.events);
    this.state.reviews = normalizeArray(this.state.reviews);
    this.state.systemAlerts = normalizeArray(this.state.systemAlerts);
    this.state.settingsHistory = normalizeArray(this.state.settingsHistory);
    this.state.reports = normalizeArray(this.state.reports);
    this.state.backups = normalizeArray(this.state.backups);
    this.state.maintenanceWindows = normalizeArray(this.state.maintenanceWindows);
    this.state.files = normalizeArray(this.state.files);
    this.state.batchJobs = normalizeArray(this.state.batchJobs);
    this.state.idempotencyRecords = normalizeArray(this.state.idempotencyRecords);
    this.state.rateLimitWindows = normalizeArray(this.state.rateLimitWindows);
    this.state.settings = this.state.settings || defaultState().settings;
    this.state.meta = this.state.meta || defaultState().meta;

    if (seedPasswordRecord) {
      const seedUser = this.state.users.find((item) => item.id === "seed-user");
      if (seedUser && !seedUser.passwordHash) {
        seedUser.passwordHash = seedPasswordRecord.hash;
        seedUser.passwordSalt = seedPasswordRecord.salt;
        seedUser.updatedAt = nowIso();
      }
    }

    await this.persist();
    return this;
  }

  async persist() {
    this.state.meta.updatedAt = nowIso();
    const serializedState = JSON.stringify(this.state, null, 2);
    const next = `${this.filePath}.tmp`;
    const write = this.persistQueue.then(async () => {
      await fsp.writeFile(next, serializedState, { mode: PRIVATE_FILE_MODE });
      await fsp.chmod(next, PRIVATE_FILE_MODE);
      await fsp.rename(next, this.filePath);
      await fsp.chmod(this.filePath, PRIVATE_FILE_MODE);
    });
    this.persistQueue = write.catch(() => {});
    return write;
  }

  async snapshot() {
    return clone(this.state);
  }

  async list(collection) {
    return clone(this.state[collection] || []);
  }

  async getSettings() {
    return clone(this.state.settings);
  }

  async updateSettings(updates) {
    this.state.settings = Object.assign({}, this.state.settings, updates, {
      updatedAt: nowIso()
    });
    this.state.settingsHistory.unshift({
      id: createId("settings"),
      createdAt: nowIso(),
      changes: clone(updates)
    });
    this.state.settingsHistory = this.state.settingsHistory.slice(0, 200);
    await this.persist();
    return this.getSettings();
  }

  async add(collection, record, options = {}) {
    const next = Object.assign({
      id: record.id || createId(options.prefix),
      createdAt: record.createdAt || nowIso(),
      updatedAt: record.updatedAt || nowIso()
    }, record);
    this.state[collection].unshift(next);
    if (options.limit && this.state[collection].length > options.limit) {
      this.state[collection] = this.state[collection].slice(0, options.limit);
    }
    await this.persist();
    return clone(next);
  }

  async replace(collection, records) {
    this.state[collection] = clone(records);
    await this.persist();
    return this.list(collection);
  }

  async findUserByEmail(email) {
    return clone(this.state.users.find((item) => item.email === email) || null);
  }

  async findUserById(id) {
    return clone(this.state.users.find((item) => item.id === id) || null);
  }

  async listUsers() {
    return this.list("users");
  }

  async createUser(record) {
    const user = Object.assign({
      id: createId("user"),
      credits: 10,
      role: "user",
      suspended: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }, record);
    this.state.users.push(user);
    await this.persist();
    return clone(user);
  }

  async updateUser(id, updates) {
    const user = this.state.users.find((item) => item.id === id);
    if (!user) return null;
    Object.assign(user, updates, { updatedAt: nowIso() });
    await this.persist();
    return clone(user);
  }

  async deleteUser(id) {
    const index = this.state.users.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const removed = this.state.users.splice(index, 1)[0];
    await this.persist();
    return clone(removed);
  }

  async createSession(record) {
    const session = Object.assign({
      id: createId("session"),
      revokedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }, record);
    this.state.sessions.unshift(session);
    await this.persist();
    return clone(session);
  }

  async findSessionByTokenHash(tokenHash) {
    return clone(this.state.sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt) || null);
  }

  async revokeSession(tokenHash) {
    const session = this.state.sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt);
    if (!session) return null;
    session.revokedAt = nowIso();
    session.updatedAt = nowIso();
    await this.persist();
    return clone(session);
  }

  async rememberIdempotency(record) {
    this.state.idempotencyRecords.unshift(record);
    this.state.idempotencyRecords = this.state.idempotencyRecords.slice(0, 500);
    await this.persist();
    return clone(record);
  }

  async findIdempotency(scope, key) {
    return clone(this.state.idempotencyRecords.find((item) => item.scope === scope && item.key === key) || null);
  }

  async touchRateLimit(record) {
    this.state.rateLimitWindows.push(record);
    this.state.rateLimitWindows = this.state.rateLimitWindows.filter((item) => item.expiresAt > Date.now());
    await this.persist();
    return clone(record);
  }

  async listRateLimits() {
    this.state.rateLimitWindows = this.state.rateLimitWindows.filter((item) => item.expiresAt > Date.now());
    return clone(this.state.rateLimitWindows);
  }
}

async function createBackendStore(options = {}) {
  const normalizedOptions = normalizeBackendStoreOptions(options);
  const storeType = normalizedOptions.storeType || process.env.BACKEND_STORE || "local";
  const seedPasswordRecord = normalizedOptions.seedPasswordRecord || null;
  if (storeType !== "local") {
    throw new Error(`Unsupported backend store "${storeType}". Only the local JSON runtime store is implemented.`);
  }

  const store = new LocalBackendStore({
    filePath: normalizedOptions.filePath
  });
  return store.initialize(seedPasswordRecord);
}

module.exports = {
  createBackendStore,
  createId,
  DEFAULT_RUNTIME_STORE_PATH,
  LocalBackendStore,
  normalizeBackendStoreOptions,
  resolveBackendFilePath
};
