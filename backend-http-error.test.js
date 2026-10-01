"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  let listener;
  let handler = () => { throw new Error("private-credential-must-not-be-logged"); };
  const logs = [];
  const moduleObject = { exports: {} };
  const dependencies = {
    "node:http": { createServer: (callback) => { listener = callback; return http.createServer(callback); } },
    "./backend-config": { backendReadiness: () => ({ ok: true }), HOST: "127.0.0.1" },
    "./backend-app": { createBackendApp: async () => ({ store: { close: async () => {} }, handle: (...args) => handler(...args) }) },
    "./backend-storage": { normalizeBackendStoreOptions: (options) => options, resolveBackendStoreType: () => "postgres" },
    "./backend-worker": { normalizeWorkerInterval: () => 5000, processWorkerCycle: async () => {} },
    "./backend-lock": { acquireRuntimeLock: async () => { throw new Error("Unexpected lock"); } }
  };
  const context = vm.createContext({
    module: moduleObject, process, console: { error: (message) => logs.push(String(message)) },
    require: (name) => { assert.ok(dependencies[name], name); return dependencies[name]; },
    setInterval, clearInterval
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "backend-server.js"), "utf8"), context);
  const runtime = await moduleObject.exports.startBackendServer({ port: 0, host: "127.0.0.1" });
  try {
    let status;
    let body;
    const response = { writeHead: (value) => { status = value; }, end: (value) => { body = value; } };
    let pending;
    assert.doesNotThrow(() => { pending = listener({}, response); }, "Synchronous handler failure must not escape the HTTP callback");
    await pending;
    assert.equal(status, 500);
    assert.equal(JSON.parse(body).error, "Internal server error");

    handler = async () => { throw new Error("private-credential-must-not-be-logged"); };
    let destroyed = 0;
    await listener({}, { headersSent: true, destroy: () => { destroyed++; }, writeHead: () => assert.fail("Must not rewrite sent headers") });
    assert.equal(destroyed, 1, "An incomplete response must terminate instead of appending a second response");
    for (const state of [{ destroyed: true }, { writableEnded: true }]) {
      await listener({}, { ...state, destroy: () => assert.fail("Must leave completed/closed responses alone"), writeHead: () => assert.fail("Must not write to completed/closed responses") });
    }
    assert.ok(logs.length);
    assert.ok(logs.every((line) => !line.includes("private-credential")), "Unexpected errors must not leak credentials to logs");

    const base = `http://127.0.0.1:${runtime.server.address().port}`;
    const failure = await fetch(base, { signal: AbortSignal.timeout(3000) });
    assert.equal(failure.status, 500);
    assert.equal(failure.headers.get("cache-control"), "no-store");
    assert.equal(failure.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await failure.json()).error, "Internal server error");
    let failPartial;
    const partialGate = new Promise((resolve) => { failPartial = resolve; });
    handler = async (_, res) => {
      res.writeHead(200);
      res.flushHeaders();
      await partialGate;
      throw new Error("private-credential-must-not-be-logged");
    };
    const partial = await fetch(base, { signal: AbortSignal.timeout(3000) });
    failPartial();
    await assert.rejects(partial.text(), "An interrupted HTTP response must not look like a complete successful response");
    handler = (_, res) => { res.writeHead(200); res.end("still available"); };
    assert.equal(await (await fetch(base, { signal: AbortSignal.timeout(3000) })).text(), "still available");
    console.log("HTTP synchronous/rejected failures, partial-response closure and sanitized fallback tests passed.");
  } finally {
    runtime.server.closeAllConnections();
    await runtime.shutdown();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
