"use strict";

const { createBackendStore, resolveBackendFilePath, resolveBackendStoreType } = require("./backend-storage");
const { processWorkerCycle, normalizeWorkerInterval } = require("./backend-worker");
const { acquireRuntimeLock } = require("./backend-lock");

const intervalMs = normalizeWorkerInterval(process.env.WORKER_INTERVAL_MS);
const once = process.argv.includes("--once");
const filePath = resolveBackendFilePath({});
let runtimeLock = null;
let stopping = false;
let wakeSleep = null;

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
      if (once || stopping) break;
      await new Promise((resolve) => {
        const finish = () => { wakeSleep = null; resolve(); };
        const timer = setTimeout(finish, intervalMs);
        wakeSleep = () => { clearTimeout(timer); finish(); };
      });
    } while (!stopping);
  } finally {
    if (typeof store.close === "function") await store.close();
  }
}

function stop() {
  stopping = true;
  if (wakeSleep) wakeSleep();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

run().then(releaseLock).catch(async (error) => {
  console.error(error.message);
  await releaseLock().catch(() => {});
  process.exit(1);
});
