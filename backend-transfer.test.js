"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createInitialState } = require("./backend-migrations");
const { createBackendStore } = require("./backend-storage");
const { inspectImport, importIntoEmptyStore } = require("./backend-transfer");

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "summarize-this-transfer-"));
  const sourcePath = path.join(directory, "snapshot.json");
  const state = createInitialState();
  state.users.push({ id: "owner", email: "owner@example.test", name: "Owner", passwordHash: "existing-hash", passwordSalt: "existing-salt" });
  state.summaries.push({ id: "summary", userId: "owner", about: "Retained source evidence", reviewedAt: "2026-09-01T00:00:00Z" });
  state.batchJobs.push({ id: "job", userId: "owner", status: "review-required", executionApproved: true });
  state.haiTokens.push({ id: "hai", tokenHash: "retained-capability-hash" });
  state.settings.retentionDays = 120;
  const source = JSON.stringify(state);
  await fs.writeFile(sourcePath, source);
  let store;
  try {
    const transfer = await inspectImport(sourcePath);
    assert.equal(transfer.summary.counts.users, 1);
    assert.equal(JSON.stringify(transfer.summary).includes("existing-hash"), false);
    await assert.rejects(inspectImport(sourcePath, "0".repeat(64)), /checksum/);
    const checked = await inspectImport(sourcePath, transfer.summary.sha256);
    store = await createBackendStore({ storeType: "local", filePath: path.join(directory, "destination.json") });
    await importIntoEmptyStore(store, checked);
    const reopened = await createBackendStore({ storeType: "local", filePath: store.filePath });
    const imported = await reopened.snapshot();
    for (const key of Object.keys(state).filter((key) => key !== "meta")) assert.deepEqual(imported[key], state[key]);
    await assert.rejects(importIntoEmptyStore(reopened, checked), /already contains/);
    assert.equal(await fs.readFile(sourcePath, "utf8"), source);

    const configured = await createBackendStore({ storeType: "local", filePath: path.join(directory, "configured.json") });
    await configured.updateSettings({ retentionDays: 30 });
    await assert.rejects(importIntoEmptyStore(configured, checked), /configured settings/);
    const original = createInitialState();
    const beforeFailure = JSON.parse(JSON.stringify(original));
    const failing = { filePath: path.join(directory, "failing.json"), state: original, snapshot: async () => JSON.parse(JSON.stringify(original)), transaction: async (update) => { update(failing.state); throw new Error("write failure"); } };
    await assert.rejects(importIntoEmptyStore(failing, checked), /write failure/);
    assert.deepEqual(failing.state, beforeFailure);
    await assert.rejects(importIntoEmptyStore({ filePath: sourcePath }, checked), /source file/);

    for (const invalid of [
      { ...state, users: {} },
      { ...state, users: undefined },
      { ...state, users: [...state.users, { ...state.users[0], id: "another-owner" }] },
      { ...state, summaries: [...state.summaries, state.summaries[0]] },
      { ...state, meta: { ...state.meta, schemaVersion: 999 } },
      JSON.parse('{"__proto__":{},"meta":{"schemaVersion":5}}')
    ]) {
      await fs.writeFile(sourcePath, JSON.stringify(invalid));
      await assert.rejects(inspectImport(sourcePath));
    }
    await fs.writeFile(sourcePath, "{broken private content");
    await assert.rejects(inspectImport(sourcePath), /not valid UTF-8 JSON/);
    await fs.writeFile(sourcePath, Buffer.from([0x7b, 0x22, 0xff]));
    await assert.rejects(inspectImport(sourcePath), /not valid UTF-8 JSON/);
    const unsafe = JSON.parse(source);
    unsafe.settings = JSON.parse('{"__proto__":{"providerMode":"external"}}');
    await fs.writeFile(sourcePath, JSON.stringify(unsafe));
    await assert.rejects(inspectImport(sourcePath), /unsafe object field/);
    const unsafeRecord = JSON.parse(source);
    unsafeRecord.summaries[0].metadata = JSON.parse('{"nested":{"__proto__":{"approved":true}}}');
    await fs.writeFile(sourcePath, JSON.stringify(unsafeRecord));
    await assert.rejects(inspectImport(sourcePath), /unsafe object field/);
    const deep = JSON.parse(source);
    let cursor = deep.summaries[0];
    for (let i = 0; i < 150; i++) cursor = cursor.nested = {};
    await fs.writeFile(sourcePath, JSON.stringify(deep));
    await assert.rejects(inspectImport(sourcePath), /nesting depth/);
    await fs.writeFile(sourcePath, source);

    if (process.env.TEST_DATABASE_URL) {
      const table = `transfer_test_${Date.now()}`;
      const postgres = await createBackendStore({ storeType: "postgres", databaseUrl: process.env.TEST_DATABASE_URL, postgresTable: table });
      try {
        await importIntoEmptyStore(postgres, checked);
      } finally {
        await postgres.close();
      }
      const verification = await createBackendStore({ storeType: "postgres", databaseUrl: process.env.TEST_DATABASE_URL, postgresTable: table });
      try {
        const persisted = await verification.snapshot();
        for (const key of Object.keys(state).filter((key) => key !== "meta")) assert.deepEqual(persisted[key], state[key]);
        await assert.rejects(importIntoEmptyStore(verification, checked), /already contains/);
      } finally {
        await verification.pool.query(`DROP TABLE "${table}"`);
        await verification.close();
      }
      console.log("PostgreSQL import and reopen verification passed.");
    }
    console.log("Backend transfer validation, preservation, and overwrite protection passed.");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
