const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 17117);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function safePathname(requestUrl) {
  try {
    const parsed = new URL(requestUrl, `http://${HOST}:${PORT}`);
    const pathname = decodeURIComponent(parsed.pathname).replace(/\\/g, "/");
    const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    return normalized === "/" ? "/index.html" : normalized;
  } catch (_error) {
    return null;
  }
}

function isPathInsideRoot(resolved) {
  const relative = path.relative(ROOT, resolved);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolveFile(requestUrl) {
  const pathname = safePathname(requestUrl);
  if (!pathname) return null;
  const resolved = path.resolve(ROOT, `.${pathname}`);

  if (!isPathInsideRoot(resolved)) {
    return null;
  }

  return resolved;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer"
};

const server = http.createServer((req, res) => {
  // CORS headers for local development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const filePath = resolveFile(req.url || "/");
  if (!filePath) {
    send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down local dev server...`);
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000);
}

function startLocalServer() {
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  server.listen(PORT, HOST, () => {
    console.log(`Summarize This local server running at http://${HOST}:${PORT}/`);
    console.log(`Open http://${HOST}:${PORT}/connector.html for the Trello connector entrypoint.`);
  });
  return server;
}

module.exports = {
  safePathname,
  isPathInsideRoot,
  resolveFile,
  startLocalServer
};

if (require.main === module) {
  startLocalServer();
}
