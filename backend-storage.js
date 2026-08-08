const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const {
  CURRENT_SCHEMA_VERSION,
  createInitialState,
  migrateState,
  validateState,
  workspaceIdForUser
} = require("./backend-migrations");

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

function resolveBackendFilePath(options = {}) {
  if (options.filePath) return String(options.filePath);
  if (options.storagePath) return String(options.storagePath);
  if (process.env.BACKEND_STORE_PATH) return String(process.env.BACKEND_STORE_PATH);
  return DEFAULT_RUNTIME_STORE_PATH;
}

function normalizeBackendStoreOptions(options = {}) {
  return Object.assign({}, options, {
    filePath: resolveBackendFilePath(options)
  });
}

function defaultState() {
  return createInitialState();
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

    this.state = migrateState(this.state).state;

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

  async transaction(updater) {
    const result = updater(this.state);
    if (result && typeof result.then === "function") throw new Error("Store transaction callbacks must be synchronous.");
    await this.persist();
    return clone(result === undefined ? null : result);
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
    user.workspaceId = user.workspaceId || workspaceIdForUser(user.id);
    this.state.users.push(user);
    if (!this.state.workspaces.some((item) => item.id === user.workspaceId)) {
      this.state.workspaces.push({
        id: user.workspaceId,
        name: `${user.name || user.email || "User"} workspace`,
        ownerUserId: user.id,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    }
    this.state.memberships.push({
      id: createId("membership"),
      workspaceId: user.workspaceId,
      userId: user.id,
      role: "owner",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
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
    const result = await this.deleteUserCascade(id);
    return result && result.user;
  }

  async createSession(record) {
    const session = Object.assign({
      id: createId("session"),
      revokedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }, record);
    const now = Date.now();
    this.state.sessions = this.state.sessions.filter((item) => {
      const expiresAt = Date.parse(String(item.expiresAt || ""));
      return !item.revokedAt && Number.isFinite(expiresAt) && expiresAt > now;
    });
    this.state.sessions.unshift(session);
    this.state.sessions = this.state.sessions.slice(0, 2000);
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

  async updateRecord(collection, id, updater) {
    const record = (this.state[collection] || []).find((item) => item.id === id);
    if (!record) return null;
    await updater(record);
    record.updatedAt = nowIso();
    await this.persist();
    return clone(record);
  }

  async schemaInfo() {
    return {
      currentVersion: CURRENT_SCHEMA_VERSION,
      storedVersion: Number(this.state.meta.schemaVersion),
      appliedMigrations: clone(this.state.meta.appliedMigrations || [])
    };
  }

  async migrate() {
    const result = migrateState(this.state);
    this.state = result.state;
    await this.persist();
    return {
      fromVersion: result.fromVersion,
      toVersion: result.toVersion,
      changed: result.changed
    };
  }

  backupDirectory() {
    return path.join(path.dirname(this.filePath), "backups");
  }

  async createBackup(options = {}) {
    const directory = this.backupDirectory();
    await fsp.mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    await fsp.chmod(directory, PRIVATE_DIRECTORY_MODE);
    const id = createId("backup");
    const fileName = `${id}.json`;
    const target = path.join(directory, fileName);
    const snapshot = clone(this.state);
    snapshot.meta.backupCreatedAt = nowIso();
    const serialized = JSON.stringify(snapshot, null, 2);
    const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
    await fsp.writeFile(target, serialized, { mode: PRIVATE_FILE_MODE, flag: "wx" });
    await fsp.chmod(target, PRIVATE_FILE_MODE);
    const verification = validateState(JSON.parse(await fsp.readFile(target, "utf8")));
    if (!verification.ok) {
      await fsp.unlink(target);
      throw new Error(`Backup verification failed: ${verification.errors.join("; ")}`);
    }
    const backup = {
      id,
      fileName,
      sha256,
      bytes: Buffer.byteLength(serialized),
      schemaVersion: Number(snapshot.meta.schemaVersion),
      reason: String(options.reason || "manual"),
      verified: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.state.backups.unshift(backup);
    const removedBackups = this.state.backups.slice(20);
    this.state.backups = this.state.backups.slice(0, 20);
    const cleanupWarnings = [];
    await Promise.all(removedBackups.map((item) => {
      if (!item.fileName || path.basename(item.fileName) !== item.fileName) return Promise.resolve();
      return fsp.unlink(path.join(directory, item.fileName)).catch((error) => {
        if (error.code !== "ENOENT") cleanupWarnings.push(`Could not remove expired backup ${item.id}`);
      });
    }));
    backup.cleanupWarnings = cleanupWarnings;
    await this.persist();
    return clone(backup);
  }

  async restoreBackup(backupId) {
    const backup = this.state.backups.find((item) => item.id === backupId);
    if (!backup) return null;
    if (path.basename(backup.fileName) !== backup.fileName) throw new Error("Invalid backup file name.");
    const target = path.join(this.backupDirectory(), backup.fileName);
    const serialized = await fsp.readFile(target, "utf8");
    const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
    if (sha256 !== backup.sha256) throw new Error("Backup integrity verification failed.");
    const parsed = JSON.parse(serialized);
    const validation = validateState(parsed);
    if (!validation.ok) throw new Error(`Backup schema validation failed: ${validation.errors.join("; ")}`);
    const preservedBackups = clone(this.state.backups);
    const migrated = migrateState(parsed).state;
    migrated.backups = preservedBackups;
    this.state = migrated;
    await this.persist();
    return { backup: clone(backup), schemaVersion: Number(this.state.meta.schemaVersion) };
  }

  async exportUserData(userId) {
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) return null;
    const workspaceIds = this.state.memberships.filter((item) => item.userId === userId).map((item) => item.workspaceId);
    const exportedUser = clone(user);
    delete exportedUser.passwordHash;
    delete exportedUser.passwordSalt;
    const record = { user: exportedUser, workspaces: [], memberships: [], summaries: [], transactions: [], events: [], reviews: [], batchJobs: [], reminders: [], notifications: [], analyticsEvents: [] };
    record.workspaces = clone(this.state.workspaces.filter((item) => workspaceIds.includes(item.id)));
    record.memberships = clone(this.state.memberships.filter((item) => item.userId === userId));
    ["summaries", "transactions", "reviews", "batchJobs", "reminders", "notifications", "analyticsEvents"].forEach((name) => {
      record[name] = clone(this.state[name].filter((item) => item.userId === userId));
    });
    record.events = clone(this.state.events.filter((item) => item.payload && item.payload.userId === userId));
    return record;
  }

  async deleteUserCascade(userId) {
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) return null;
    const removed = {};
    const directCollections = ["sessions", "summaries", "transactions", "reviews", "batchJobs", "reminders", "notifications", "analyticsEvents"];
    directCollections.forEach((name) => {
      const before = this.state[name].length;
      this.state[name] = this.state[name].filter((item) => item.userId !== userId);
      removed[name] = before - this.state[name].length;
    });
    const eventCount = this.state.events.length;
    this.state.events = this.state.events.filter((item) => !(item.payload && item.payload.userId === userId));
    removed.events = eventCount - this.state.events.length;
    const membershipCount = this.state.memberships.length;
    const ownedWorkspaceIds = this.state.workspaces.filter((item) => item.ownerUserId === userId).map((item) => item.id);
    this.state.memberships = this.state.memberships.filter((item) => item.userId !== userId && !ownedWorkspaceIds.includes(item.workspaceId));
    this.state.workspaces = this.state.workspaces.filter((item) => item.ownerUserId !== userId);
    removed.memberships = membershipCount - this.state.memberships.length;
    removed.workspaces = ownedWorkspaceIds.length;
    this.state.users = this.state.users.filter((item) => item.id !== userId);
    await this.persist();
    return { user: clone(user), removed };
  }

  async reconcile(options = {}) {
    const apply = Boolean(options.apply);
    const issues = [];
    const fixes = [];
    const usersById = new Map(this.state.users.map((item) => [item.id, item]));
    const seenEmails = new Map();
    this.state.users.forEach((user) => {
      const email = String(user.email || "").toLowerCase();
      if (seenEmails.has(email)) issues.push({ type: "duplicate-user-email", userId: user.id, otherUserId: seenEmails.get(email) });
      else seenEmails.set(email, user.id);
      if (!user.workspaceId) {
        issues.push({ type: "missing-user-workspace", userId: user.id });
        if (apply) {
          user.workspaceId = workspaceIdForUser(user.id);
          fixes.push({ type: "assigned-user-workspace", userId: user.id, workspaceId: user.workspaceId });
        }
      }
    });
    const sessionCount = this.state.sessions.length;
    this.state.sessions.forEach((session) => {
      if (session.role !== "admin" && !usersById.has(session.userId)) issues.push({ type: "orphan-session", sessionId: session.id });
    });
    if (apply) {
      this.state.sessions = this.state.sessions.filter((session) => session.role === "admin" || usersById.has(session.userId));
      if (sessionCount !== this.state.sessions.length) fixes.push({ type: "removed-orphan-sessions", count: sessionCount - this.state.sessions.length });
    }
    ["summaries", "transactions", "batchJobs", "reminders", "notifications", "analyticsEvents"].forEach((name) => {
      const before = this.state[name].length;
      this.state[name].forEach((item) => {
        if (item.userId && !usersById.has(item.userId)) issues.push({ type: "orphan-record", collection: name, id: item.id, userId: item.userId });
      });
      if (apply) {
        this.state[name] = this.state[name].filter((item) => !item.userId || usersById.has(item.userId));
        if (before !== this.state[name].length) fixes.push({ type: "removed-orphan-records", collection: name, count: before - this.state[name].length });
      }
    });
    this.state.users.forEach((user) => {
      const workspaceId = user.workspaceId || workspaceIdForUser(user.id);
      if (!this.state.workspaces.some((item) => item.id === workspaceId)) {
        issues.push({ type: "missing-workspace", userId: user.id, workspaceId });
        if (apply) {
          this.state.workspaces.push({ id: workspaceId, name: `${user.name || user.email || "User"} workspace`, ownerUserId: user.id, createdAt: nowIso(), updatedAt: nowIso() });
          fixes.push({ type: "created-workspace", workspaceId });
        }
      }
      if (!this.state.memberships.some((item) => item.userId === user.id && item.workspaceId === workspaceId)) {
        issues.push({ type: "missing-owner-membership", userId: user.id, workspaceId });
        if (apply) {
          this.state.memberships.push({ id: createId("membership"), userId: user.id, workspaceId, role: "owner", createdAt: nowIso(), updatedAt: nowIso() });
          fixes.push({ type: "created-owner-membership", userId: user.id, workspaceId });
        }
      }
    });
    if (apply && fixes.length) await this.persist();
    if (apply) {
      const verification = await this.reconcile({ apply: false });
      return { ok: verification.issues.length === 0, apply, issues, fixes, remainingIssues: verification.issues, schemaVersion: Number(this.state.meta.schemaVersion) };
    }
    return { ok: issues.length === 0, apply, issues, fixes, remainingIssues: issues, schemaVersion: Number(this.state.meta.schemaVersion) };
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
  CURRENT_SCHEMA_VERSION,
  defaultState,
  normalizeBackendStoreOptions,
  resolveBackendFilePath
};
