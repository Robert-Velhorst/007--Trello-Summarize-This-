"use strict";

const assert = require("node:assert/strict");
const { PostgresBackendStore } = require("./backend-storage");
const { createInitialState } = require("./backend-migrations");

async function main() {
  const store = new PostgresBackendStore();
  store.state = createInitialState();
  const writes = [];
  let releaseFirst;
  store.pool = { query: async (_sql, parameters) => {
    writes.push({ state: JSON.parse(parameters[0]), revision: parameters[1] });
    if (writes.length === 1) await new Promise((resolve) => { releaseFirst = resolve; });
    return { rowCount: 1, rows: [{ revision: writes.length }] };
  } };
  store.state.settings.retentionDays = 30;
  const first = store.persist();
  await new Promise((resolve) => setImmediate(resolve));
  store.state.settings.retentionDays = 60;
  const second = store.persist();
  store.state.settings.retentionDays = 90;
  assert.equal(writes.length, 1, "Queued writes must not bypass the first pending persistence operation");
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(writes.map((write) => write.state.settings.retentionDays), [30, 60]);
  assert.deepEqual(writes.map((write) => write.revision), [0, 1]);
  assert.equal(store.databaseRevision, 2);
  console.log("PostgreSQL immutable snapshot and ordered-write tests passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
