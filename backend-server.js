const http = require("node:http");
const config = require("./backend-config");
const { createBackendApp } = require("./backend-app");
const { normalizeBackendStoreOptions, resolveBackendStoreType } = require("./backend-storage");
const { processWorkerCycle } = require("./backend-worker");
const { acquireRuntimeLock } = require("./backend-lock");

function startIntegratedWorker(store, options = {}) {
  if (String(options.runWorker !== undefined ? options.runWorker : process.env.RUN_WORKER || "").toLowerCase() !== "true") return null;
  const intervalMs = Math.max(1_000, Number(options.workerIntervalMs || process.env.WORKER_INTERVAL_MS || 5_000));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processWorkerCycle(store);
    } catch (error) {
      console.error(`Integrated worker cycle failed: ${error.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return timer;
}

async function startBackendServer(options = {}) {
  const normalizedOptions = normalizeBackendStoreOptions(options);
  const readiness = config.backendReadiness();
  if (!readiness.ok && !normalizedOptions.allowMissingEnv) {
    const error = new Error(`Backend startup blocked. Missing required environment variables: ${readiness.missing.join(", ")}`);
    error.code = "BACKEND_ENV_MISSING";
    throw error;
  }

  const runtimeLock = resolveBackendStoreType(normalizedOptions) === "local"
    ? await acquireRuntimeLock(normalizedOptions.filePath, "backend server")
    : { release: async () => {} };
  try {
    const app = await createBackendApp(normalizedOptions);
    const workerTimer = startIntegratedWorker(app.store, normalizedOptions);
    const server = http.createServer((req, res) => {
      Promise.resolve(app.handle(req, res)).catch((error) => {
        console.error(`Unhandled backend request failure: ${error.message}`);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: "Internal server error" }));
      });
    });
    return await new Promise((resolve, reject) => {
      server.on("close", () => {
        if (workerTimer) clearInterval(workerTimer);
        Promise.resolve(app.store && typeof app.store.close === "function" ? app.store.close() : null)
          .then(() => runtimeLock.release())
          .catch((error) => console.error(`Could not close backend runtime: ${error.message}`));
      });
      server.once("error", (error) => {
        runtimeLock.release().finally(() => reject(error));
      });
      const port = normalizedOptions.port !== undefined ? normalizedOptions.port : config.PORT;
      server.listen(port, normalizedOptions.host || config.HOST, () => {
        resolve({ server, app });
      });
    });
  } catch (error) {
    await runtimeLock.release();
    throw error;
  }
}

if (require.main === module) {
  startBackendServer().then(({ server }) => {
    const address = server.address();
    console.log(`Summarize This backend listening on http://${address.address}:${address.port}/api/health`);
    const shutdown = () => server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  startBackendServer,
  startIntegratedWorker
};
