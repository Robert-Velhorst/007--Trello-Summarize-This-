"use strict";

const { createBackendStore, resolveBackendFilePath, resolveBackendStoreType } = require("./backend-storage");
const { processWorkerCycle } = require("./backend-worker");
const { acquireRuntimeLock } = require("./backend-lock");

const intervalMs = Math.max(1_000, Number(process.env.WORKER_INTERVAL_MS || 5_000));
const once = process.argv.includes("--once");
const filePath = resolveBackendFilePath({});
let runtimeLock = null;
let stopping = false;

async function acquireLock() {
  runtimeLock = resolveBackendStoreType({}) === "local"
    ? await acquireRuntimeLock(filePath, "standalone worker")
    : { release: async () => {} };
}

async function releaseLock() {
  if (runtimeLock) await runtimeLock.release();
  runtimeLock = null;
}

async function run() {
  await acquireLock();
  const store = await createBackendStore({ filePath });
  try {
    do {
      const result = await processWorkerCycle(store);
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), result }));
      if (once) break;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } while (!stopping);
  } finally {
    if (typeof store.close === "function") await store.close();
  }
}

async function stop() {
  stopping = true;
  await releaseLock();
}

process.on("SIGINT", () => stop().then(() => process.exit(0)));
process.on("SIGTERM", () => stop().then(() => process.exit(0)));

run().then(stop).catch(async (error) => {
  console.error(error.message);
  await releaseLock().catch(() => {});
  process.exit(1);
});
