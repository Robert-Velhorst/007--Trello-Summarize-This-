"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBackendStore, CURRENT_SCHEMA_VERSION } = require("./backend-storage");
const { processWorkerCycle, processNextBatchJob } = require("./backend-worker");
const { buildSupportBundle } = require("./backend-support");
const { acquireRuntimeLock } = require("./backend-lock");

function tempStorePath(label) {
  return path.join(os.tmpdir(), `summarize-this-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`, "store.json");
}

async function main() {
  const migrationPath = tempStorePath("migration");
  fs.mkdirSync(path.dirname(migrationPath), { recursive: true });
  fs.writeFileSync(migrationPath, JSON.stringify({
    meta: { schemaVersion: 1, createdAt: new Date().toISOString(), appliedMigrations: [1] },
    settings: {},
    users: [{ id: "legacy-user", email: "legacy@example.test", name: "Legacy", createdAt: new Date().toISOString() }]
  }));
  const migrated = await createBackendStore({ filePath: migrationPath });
  const schema = await migrated.schemaInfo();
  assert.equal(schema.storedVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(schema.appliedMigrations, [1, 2, 3, 4, 5]);
  assert.equal((await migrated.list("workspaces")).length, 1);
  assert.equal((await migrated.list("memberships"))[0].role, "owner");

  const filePath = tempStorePath("operations");
  const store = await createBackendStore({ filePath });
  const user = await store.createUser({
    email: "operations@example.test",
    name: "Operations User",
    passwordHash: "not-a-real-hash",
    passwordSalt: "not-a-real-salt"
  });
  assert.ok(user.workspaceId);
  const exported = await store.exportUserData(user.id);
  assert.equal(Object.hasOwn(exported.user, "passwordHash"), false);
  assert.equal(Object.hasOwn(exported.user, "passwordSalt"), false);

  const dueAt = new Date(Date.now() - 1_000).toISOString();
  await store.add("reminders", { id: "due-reminder", userId: user.id, workspaceId: user.workspaceId, dueAt, status: "scheduled", message: "Review summary" });
  const sourceText = "This explicit source text is long enough for deterministic local summarization and remains available for review.";
  await store.add("batchJobs", {
    id: "approved-job",
    userId: user.id,
    workspaceId: user.workspaceId,
    status: "queued",
    executionMode: "local-worker",
    executionApproved: true,
    maxAttempts: 3,
    cards: [{ id: "card-1", name: "Card", inputText: sourceText, status: "pending", attempts: 0 }]
  });
  const cycle = await processWorkerCycle(store, { now: Date.now() });
  assert.equal(cycle.reminders.processed, 1);
  assert.equal(cycle.batch.processed, true);
  assert.equal(cycle.batch.job.status, "review-required");
  assert.equal(cycle.batch.job.cards[0].result.providerMode, "local");
  assert.equal((await store.list("notifications"))[0].status, "unread");

  await store.add("batchJobs", {
    id: "retry-job",
    userId: user.id,
    workspaceId: user.workspaceId,
    status: "queued",
    executionMode: "local-worker",
    executionApproved: true,
    maxAttempts: 2,
    cards: [{ id: "retry-card", inputText: sourceText, status: "pending", attempts: 0 }]
  });
  const failedOnce = await processNextBatchJob(store, { now: Date.now(), retryBaseMs: 100, processor: async () => { throw new Error("temporary failure"); } });
  assert.equal(failedOnce.job.status, "retry-wait");
  const retryAt = Date.parse(failedOnce.job.nextAttemptAt) + 1;
  const failedTwice = await processNextBatchJob(store, { now: retryAt, retryBaseMs: 100, processor: async () => { throw new Error("permanent failure"); } });
  assert.equal(failedTwice.job.status, "needs-attention");
  assert.equal(failedTwice.job.cards[0].status, "failed");

  const backup = await store.createBackup({ reason: "operations contract" });
  assert.equal(backup.verified, true);
  await store.updateUser(user.id, { name: "Changed after backup" });
  await store.restoreBackup(backup.id);
  assert.equal((await store.findUserById(user.id)).name, "Operations User");

  await store.add("transactions", { id: "orphan-transaction", userId: "missing-user", type: "test", status: "completed" });
  const dryRun = await store.reconcile({ apply: false });
  assert.ok(dryRun.issues.some((item) => item.type === "orphan-record"));
  const repaired = await store.reconcile({ apply: true });
  assert.equal(repaired.ok, true);
  assert.equal((await store.list("transactions")).some((item) => item.id === "orphan-transaction"), false);

  const bundle = await buildSupportBundle(store, { ok: true, missing: [], optional: [] });
  const serializedBundle = JSON.stringify(bundle);
  assert.equal(serializedBundle.includes(user.email), false);
  assert.equal(serializedBundle.includes(sourceText), false);
  assert.match(bundle.privacy, /Credentials/);

  const lock = await acquireRuntimeLock(filePath, "operations test");
  await assert.rejects(() => acquireRuntimeLock(filePath, "competing test process"), /owns the backend store lock/);
  await lock.release();
  fs.writeFileSync(`${filePath}.runtime.lock`, "not-json");
  await assert.rejects(() => acquireRuntimeLock(filePath, "malformed lock test"), /owner cannot be verified/);
  fs.rmSync(`${filePath}.runtime.lock`, { force: true });
  fs.writeFileSync(`${filePath}.runtime.lock`, JSON.stringify({ pid: 2147483647, owner: "stale process" }));
  const recoveredLock = await acquireRuntimeLock(filePath, "stale lock recovery");
  await recoveredLock.release();

  fs.rmSync(path.dirname(migrationPath), { recursive: true, force: true });
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  console.log("All operations tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
