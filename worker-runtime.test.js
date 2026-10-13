"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const { normalizeWorkerInterval } = require("./backend-worker");

async function main() {
  for (const invalid of [undefined, "", "bad", NaN, Infinity, -Infinity, 0, -1]) {
    assert.equal(normalizeWorkerInterval(invalid), 5000);
  }
  assert.equal(normalizeWorkerInterval("7500"), 7500);
  assert.equal(normalizeWorkerInterval(1500.9), 1500);
  assert.equal(normalizeWorkerInterval(5), 1000);
  assert.equal(normalizeWorkerInterval(9e12), 2147483647);

  const occupied = http.createServer();
  await new Promise((resolve, reject) => {
    occupied.once("error", reject);
    occupied.listen(0, "127.0.0.1", resolve);
  });
  let closed = 0;
  let cycles = 0;
  let scheduled = 0;
  let delayCycle = false;
  let releaseCycle;
  let tick;
  const moduleObject = { exports: {} };
  const dependencies = {
    "node:http": http,
    "./backend-config": { backendReadiness: () => ({ ok: true }), HOST: "127.0.0.1" },
    "./backend-app": { createBackendApp: async () => ({ store: { close: async () => { closed++; } } }) },
    "./backend-storage": { normalizeBackendStoreOptions: (options) => options, resolveBackendStoreType: () => "postgres" },
    "./backend-worker": { normalizeWorkerInterval, processWorkerCycle: async () => {
      cycles++;
      if (delayCycle) await new Promise((resolve) => { releaseCycle = resolve; });
    } },
    "./backend-lock": { acquireRuntimeLock: async () => { throw new Error("Unexpected local lock"); } }
  };
  const context = vm.createContext({
    module: moduleObject, process, console,
    require: (name) => { assert.ok(dependencies[name], `Unexpected dependency ${name}`); return dependencies[name]; },
    setInterval: (callback) => { scheduled++; tick = callback; return { unref() {} }; }, clearInterval: () => {}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "backend-server.js"), "utf8"), context);
  try {
    await assert.rejects(moduleObject.exports.startBackendServer({
      port: occupied.address().port, host: "127.0.0.1", runWorker: true
    }), (error) => error.code === "EADDRINUSE");
    assert.equal(closed, 1, "A failed listener must close the opened store exactly once");
    assert.equal(cycles, 0, "Worker must not mutate data before the HTTP listener succeeds");
    assert.equal(scheduled, 0, "Failed startup must not leave a worker timer scheduled");
  } finally {
    await new Promise((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
  }
  delayCycle = true;
  const runtime = await moduleObject.exports.startBackendServer({ port: 0, host: "127.0.0.1", runWorker: true });
  const stopping = runtime.shutdown();
  assert.equal(runtime.shutdown(), stopping, "Repeated stop requests must share the same cleanup promise");
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cycles, 1);
    assert.equal(closed, 1, "Store must remain open while an active worker cycle drains");
    releaseCycle();
    await stopping;
    assert.equal(closed, 2, "Shutdown must close the store once after its active cycle finishes");
    await tick();
    assert.equal(cycles, 1, "A stopped worker must not start another cycle");
  } finally {
    if (releaseCycle) releaseCycle();
    await stopping;
  }
  const signals = {};
  const order = [];
  let finishStandaloneCycle;
  const standaloneDependencies = {
    "./backend-storage": {
      resolveBackendFilePath: () => "synthetic-store",
      resolveBackendStoreType: () => "local",
      createBackendStore: async () => ({ close: async () => { order.push("store-closed"); } })
    },
    "./backend-worker": {
      normalizeWorkerInterval,
      processWorkerCycle: async () => {
        order.push("cycle-started");
        await new Promise((resolve) => { finishStandaloneCycle = resolve; });
        order.push("cycle-finished");
        return {};
      }
    },
    "./backend-lock": { acquireRuntimeLock: async () => ({ release: async () => { order.push("lock-released"); } }) }
  };
  const standaloneContext = vm.createContext({
    require: (name) => { assert.ok(standaloneDependencies[name]); return standaloneDependencies[name]; },
    process: { env: {}, argv: ["node", "worker.js"], on: (signal, handler) => { signals[signal] = handler; }, exit: () => { order.push("unexpected-exit"); } },
    console: { log() {}, error: (message) => { order.push(`error:${message}`); } }, setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "worker.js"), "utf8"), standaloneContext);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finishStandaloneCycle, "function");
  signals.SIGTERM();
  assert.deepEqual(order, ["cycle-started"], "Stop must not release the standalone lock while a cycle runs");
  finishStandaloneCycle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["cycle-started", "cycle-finished", "store-closed", "lock-released"]);
  console.log("Worker intervals, failed-startup cleanup and integrated/standalone shutdown-drain tests passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
