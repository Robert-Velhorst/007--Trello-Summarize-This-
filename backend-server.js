const http = require("node:http");
const config = require("./backend-config");
const { createBackendApp } = require("./backend-app");
const { normalizeBackendStoreOptions } = require("./backend-storage");

function startBackendServer(options = {}) {
  const normalizedOptions = normalizeBackendStoreOptions(options);
  const readiness = config.backendReadiness();
  if (!readiness.ok && !normalizedOptions.allowMissingEnv) {
    const error = new Error(`Backend startup blocked. Missing required environment variables: ${readiness.missing.join(", ")}`);
    error.code = "BACKEND_ENV_MISSING";
    throw error;
  }

  return Promise.resolve(createBackendApp(normalizedOptions)).then((app) => {
    const server = http.createServer((req, res) => {
      Promise.resolve(app.handle(req, res)).catch((error) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      });
    });
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(normalizedOptions.port || config.PORT, normalizedOptions.host || config.HOST, () => {
        resolve({ server, app });
      });
    });
  });
}

if (require.main === module) {
  startBackendServer().then(({ server }) => {
    const address = server.address();
    console.log(`Summarize This backend listening on http://${address.address}:${address.port}/api/health`);
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  startBackendServer
};
