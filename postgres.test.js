"use strict";

const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { createBackendStore } = require("./backend-storage");

const databaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();

if (!databaseUrl) {
  console.log("PostgreSQL integration test skipped: TEST_DATABASE_URL is not configured.");
} else {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function run() {
  const tableName = `summarize_this_test_${process.pid}`;
  const cleanupPool = new Pool({ connectionString: databaseUrl, max: 1 });
  let firstStore = null;
  let reopenedStore = null;
  try {
    await cleanupPool.query(`DROP TABLE IF EXISTS "${tableName}"`);
    firstStore = await createBackendStore({
      storeType: "postgres",
      databaseUrl,
      postgresTable: tableName
    });
    assert.equal(firstStore.storageKind, "postgres");
    const user = await firstStore.createUser({
      email: "postgres-contract@example.test",
      name: "PostgreSQL Contract",
      passwordHash: "hash",
      passwordSalt: "salt"
    });
    await firstStore.add("summaries", {
      userId: user.id,
      workspaceId: user.workspaceId,
      summary: "Durably persisted PostgreSQL summary",
      confidence: 0.8
    });
    const health = await firstStore.databaseHealth();
    assert.equal(health.ok, true);
    assert.equal(health.kind, "postgres");

    await assert.rejects(
      createBackendStore({ storeType: "postgres", databaseUrl, postgresTable: tableName }),
      /another Summarize This writer owns this database state/
    );

    await firstStore.close();
    firstStore = null;
    reopenedStore = await createBackendStore({
      storeType: "postgres",
      databaseUrl,
      postgresTable: tableName
    });
    assert.equal((await reopenedStore.findUserByEmail("postgres-contract@example.test")).id, user.id);
    assert.equal((await reopenedStore.list("summaries"))[0].summary, "Durably persisted PostgreSQL summary");
    console.log("PostgreSQL persistence and writer-exclusion tests passed.");
  } finally {
    if (firstStore) await firstStore.close().catch(() => {});
    if (reopenedStore) await reopenedStore.close().catch(() => {});
    await cleanupPool.query(`DROP TABLE IF EXISTS "${tableName}"`).catch(() => {});
    await cleanupPool.end();
  }
}
