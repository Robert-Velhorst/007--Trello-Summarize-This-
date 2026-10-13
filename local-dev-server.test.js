"use strict";

const assert = require("node:assert/strict");
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
const { startLocalServer } = require("./local-dev-server");

async function main() {
  const server = startLocalServer();
  try {
    if (!server.listening) await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const file of ["/", "/connector.html", "/popup.html", "/summarizer-core.js", "/icon.svg"]) {
      const response = await fetch(base + file);
      assert.equal(response.status, 200, `Runtime asset should be accessible: ${file}`);
      await response.arrayBuffer();
    }
    for (const file of ["/.env", "/.env.example", "/package.json", "/backend-app.js", "/database/runtime/local-backend-store.json", "/.git/config", "/%2eenv.example", "/node_modules/pg/package.json"]) {
      const response = await fetch(base + file, { headers: { Origin: "https://untrusted.example" } });
      assert.equal(response.status, 403, `Non-runtime file must not be served: ${file}`);
      assert.equal(await response.text(), "Forbidden");
    }
    const write = await fetch(base + "/connector.html", { method: "POST", body: "unwanted write" });
    assert.equal(write.status, 405);
    assert.equal(write.headers.get("allow"), "GET, OPTIONS");
    await write.arrayBuffer();
    console.log("Local HTTP runtime allowlist and method-boundary tests passed.");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
