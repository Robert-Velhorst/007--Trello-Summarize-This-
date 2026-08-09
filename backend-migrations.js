"use strict";

const CURRENT_SCHEMA_VERSION = 5;
const COLLECTIONS = [
  "users",
  "sessions",
  "summaries",
  "transactions",
  "events",
  "reviews",
  "systemAlerts",
  "settingsHistory",
  "reports",
  "backups",
  "maintenanceWindows",
  "files",
  "batchJobs",
  "idempotencyRecords",
  "rateLimitWindows",
  "workspaces",
  "memberships",
  "reminders",
  "notifications",
  "analyticsEvents",
  "haiTokens"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function workspaceIdForUser(userId) {
  return `workspace_${String(userId || "unknown")}`;
}

function baseSettings() {
  return {
    proxyEndpoint: "",
    providerMode: "local",
    trelloKeyConfigured: false,
    billingMode: "disabled",
    analyticsMode: "local-aggregate",
    retentionDays: 90
  };
}

function createInitialState() {
  const createdAt = nowIso();
  const state = {
    meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt,
      updatedAt: createdAt,
      appliedMigrations: [1, 2, 3, 4, 5]
    },
    settings: baseSettings()
  };
  COLLECTIONS.forEach((name) => {
    state[name] = [];
  });
  return state;
}

function ensureCollections(state) {
  COLLECTIONS.forEach((name) => {
    if (!Array.isArray(state[name])) state[name] = [];
  });
  state.settings = Object.assign(baseSettings(), state.settings || {});
  state.meta = Object.assign({
    schemaVersion: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    appliedMigrations: []
  }, state.meta || {});
  if (!Array.isArray(state.meta.appliedMigrations)) state.meta.appliedMigrations = [];
  return state;
}

function migrateOneToTwo(state) {
  ensureCollections(state);
  state.users.forEach((user) => {
    const workspaceId = user.workspaceId || workspaceIdForUser(user.id);
    user.workspaceId = workspaceId;
    if (!state.workspaces.some((item) => item.id === workspaceId)) {
      state.workspaces.push({
        id: workspaceId,
        name: `${user.name || user.email || "User"} workspace`,
        ownerUserId: user.id,
        createdAt: user.createdAt || nowIso(),
        updatedAt: nowIso()
      });
    }
    if (!state.memberships.some((item) => item.workspaceId === workspaceId && item.userId === user.id)) {
      state.memberships.push({
        id: `membership_${workspaceId}_${user.id}`,
        workspaceId,
        userId: user.id,
        role: "owner",
        createdAt: user.createdAt || nowIso(),
        updatedAt: nowIso()
      });
    }
  });
  state.meta.schemaVersion = 2;
  state.meta.appliedMigrations.push(2);
  return state;
}

function migrateTwoToThree(state) {
  ensureCollections(state);
  state.batchJobs.forEach((job) => {
    const user = state.users.find((item) => item.id === job.userId);
    job.workspaceId = job.workspaceId || (user && user.workspaceId) || null;
    job.executionMode = job.executionMode || "manual-reviewed";
    job.executionApproved = Boolean(job.executionApproved || job.aiHandoffApproved);
    job.maxAttempts = Math.max(1, Math.min(5, Number(job.maxAttempts || 3)));
    job.nextAttemptAt = job.nextAttemptAt || null;
    job.leaseExpiresAt = job.leaseExpiresAt || null;
    job.workerId = job.workerId || null;
    (job.cards || []).forEach((card) => {
      card.attempts = Math.max(0, Number(card.attempts || 0));
      card.nextAttemptAt = card.nextAttemptAt || null;
    });
  });
  state.meta.schemaVersion = 3;
  state.meta.appliedMigrations.push(3);
  return state;
}

function migrateThreeToFour(state) {
  ensureCollections(state);
  state.settings = Object.assign(baseSettings(), state.settings || {});
  state.meta.schemaVersion = 4;
  state.meta.appliedMigrations.push(4);
  return state;
}

function migrateFourToFive(state) {
  ensureCollections(state);
  state.summaries.forEach((summary) => {
    summary.reviewedAt = summary.reviewedAt || null;
    summary.haiApprovedAt = summary.haiApprovedAt || null;
  });
  state.meta.schemaVersion = 5;
  state.meta.appliedMigrations.push(5);
  return state;
}

const MIGRATIONS = {
  1: migrateOneToTwo,
  2: migrateTwoToThree,
  3: migrateThreeToFour,
  4: migrateFourToFive
};

function validateState(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["State must be an object"] };
  }
  if (!input.meta || !Number.isInteger(Number(input.meta.schemaVersion))) {
    errors.push("meta.schemaVersion must be an integer");
  }
  const version = Number(input.meta && input.meta.schemaVersion || 0);
  if (version < 1 || version > CURRENT_SCHEMA_VERSION) {
    errors.push(`Unsupported schema version ${version}`);
  }
  COLLECTIONS.forEach((name) => {
    if (!Array.isArray(input[name])) errors.push(`${name} must be an array`);
  });
  if (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) {
    errors.push("settings must be an object");
  }
  return { ok: errors.length === 0, errors };
}

function migrateState(input) {
  const state = ensureCollections(clone(input || createInitialState()));
  const fromVersion = Number(state.meta.schemaVersion || 1);
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Backend store schema ${fromVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`);
  }
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`No migration is registered for schema version ${version}.`);
    migrate(state);
    version = Number(state.meta.schemaVersion);
  }
  state.meta.appliedMigrations = Array.from(new Set(state.meta.appliedMigrations.map(Number))).sort((a, b) => a - b);
  state.meta.updatedAt = nowIso();
  const validation = validateState(state);
  if (!validation.ok) throw new Error(`Backend store validation failed: ${validation.errors.join("; ")}`);
  return { state, fromVersion, toVersion: CURRENT_SCHEMA_VERSION, changed: fromVersion !== CURRENT_SCHEMA_VERSION };
}

module.exports = {
  COLLECTIONS,
  CURRENT_SCHEMA_VERSION,
  createInitialState,
  migrateState,
  validateState,
  workspaceIdForUser
};
