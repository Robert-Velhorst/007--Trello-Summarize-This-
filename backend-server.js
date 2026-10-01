const http = require("node:http");
const config = require("./backend-config");
const { createBackendApp } = require("./backend-app");
const { normalizeBackendStoreOptions, resolveBackendStoreType } = require("./backend-storage");
const { processWorkerCycle, normalizeWorkerInterval } = require("./backend-worker");
const { acquireRuntimeLock } = require("./backend-lock");

function startIntegratedWorker(store, options = {}) {
  if (String(options.runWorker !== undefined ? options.runWorker : process.env.RUN_WORKER || "").toLowerCase() !== "true") return null;
  const intervalMs = normalizeWorkerInterval(options.workerIntervalMs !== undefined ? options.workerIntervalMs : process.env.WORKER_INTERVAL_MS);
  let running = false;
  let stopped = false;
  let activeCycle = Promise.resolve();
  const tick = () => {
    if (running || stopped) return activeCycle;
    running = true;
    activeCycle = (async () => {
      try {
        await processWorkerCycle(store);
      } catch (error) {
        console.error(`Integrated worker cycle failed: ${error.message}`);
      } finally {
        running = false;
      }
    })();
    return activeCycle;
  };
  const timer = setInterval(tick, intervalMs);
  timer.stop = async () => {
    stopped = true;
    clearInterval(timer);
    await activeCycle;
  };
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
  let app;
  let workerTimer;
  let cleanupPromise;
  const cleanup = () => {
    if (!cleanupPromise) {
      cleanupPromise = Promise.resolve()
        .then(() => workerTimer ? workerTimer.stop() : null)
        .then(() => app && app.store && typeof app.store.close === "function" ? app.store.close() : null)
        .finally(() => runtimeLock.release());
    }
    return cleanupPromise;
  };
  try {
    app = await createBackendApp(normalizedOptions);
    const server = http.createServer((req, res) => {
      Promise.resolve(app.handle(req, res)).catch((error) => {
        console.error(`Unhandled backend request failure: ${error.message}`);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: "Internal server error" }));
      });
    });
    return await new Promise((resolve, reject) => {
      server.on("close", () => {
        cleanup().catch((error) => console.error(`Could not close backend runtime: ${error.message}`));
      });
      server.once("error", (error) => {
        cleanup().catch((cleanupError) => console.error(`Could not close backend runtime: ${cleanupError.message}`))
          .then(() => reject(error));
      });
      const port = normalizedOptions.port !== undefined ? normalizedOptions.port : config.PORT;
      server.listen(port, normalizedOptions.host || config.HOST, () => {
        workerTimer = startIntegratedWorker(app.store, normalizedOptions);
        let shutdownPromise;
        const shutdown = () => {
          if (!shutdownPromise) {
            shutdownPromise = new Promise((done, fail) => server.close((error) => error ? fail(error) : done()))
              .then(cleanup);
          }
          return shutdownPromise;
        };
        resolve({ server, app, shutdown });
      });
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

if (require.main === module) {
  startBackendServer().then(({ server, shutdown }) => {
    const address = server.address();
    console.log(`Summarize This backend listening on http://${address.address}:${address.port}/api/health`);
    const stop = () => shutdown().then(() => process.exit(0)).catch((error) => {
      console.error(`Could not stop backend runtime: ${error.message}`);
      process.exit(1);
    });
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  startBackendServer,
  startIntegratedWorker
};
