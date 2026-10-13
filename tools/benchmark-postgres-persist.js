"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { createInitialState } = require("../backend-migrations");

const root = path.resolve(__dirname, "..");
const baselineRevision = execFileSync("git", ["rev-parse", "--verify", `${process.argv[2] || "HEAD"}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
const baselineSource = execFileSync("git", ["show", `${baselineRevision}:backend-storage.js`], { cwd: root, encoding: "utf8" });
const baselineModule = { exports: {} };
vm.runInNewContext(baselineSource, {
  module: baselineModule, require: createRequire(path.join(root, "backend-storage.js")), __dirname: root,
  process, console, Buffer, setTimeout, clearTimeout
});

async function measure(Store) {
  const store = new Store();
  store.state = createInitialState();
  store.state.summaries = Array.from({ length: 500 }, (_, index) => ({ id: `synthetic-${index}`, summary: "x".repeat(10000) }));
  let revision = 0;
  store.pool = { query: async (_sql, parameters) => {
    assert.equal(typeof parameters[0], "string");
    assert.equal(parameters[1], revision);
    return { rowCount: 1, rows: [{ revision: ++revision }] };
  } };
  for (let index = 0; index < 3; index++) await store.persist();
  const samples = [];
  const cpuStart = process.cpuUsage();
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    await store.persist();
    samples.push(performance.now() - started);
  }
  const cpu = process.cpuUsage(cpuStart);
  samples.sort((a, b) => a - b);
  return {
    samples: samples.length, stateBytes: Buffer.byteLength(JSON.stringify(store.state)),
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
    p95Ms: Number(samples[Math.ceil(samples.length * 0.95) - 1].toFixed(2)),
    cpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(2))
  };
}

async function main() {
  console.log(JSON.stringify({
    scope: "Synthetic 500-record persistence serialization/queue microbenchmark; SQL is stubbed. No real database I/O, network, browser latency or peak-memory claim.",
    baselineRevision, nodeVersion: process.version,
    baseline: await measure(baselineModule.exports.PostgresBackendStore),
    current: await measure(require("../backend-storage").PostgresBackendStore)
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
