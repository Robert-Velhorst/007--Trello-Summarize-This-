"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const html = fs.readFileSync(path.join(__dirname, "settings-powerup.html"), "utf8");
  const match = html.match(/async function logoutBackendAccount\(\) \{[\s\S]*?\n      \}/);
  assert.ok(match, "Settings logout handler must be present");
  for (const scenario of [
    { fieldToken: "", savedToken: "saved-session", fail: false },
    { fieldToken: "visible-session", savedToken: "", fail: false },
    { fieldToken: "", savedToken: "saved-session", fail: true },
    { fieldToken: "", savedToken: "", fail: false }
  ]) {
    const fields = {
      backendSessionToken: { value: scenario.fieldToken }, backendPassword: { value: "private" },
      haiConnectorUrl: { value: "private-capability" }, backendStatus: { textContent: "Signed in" }
    };
    const calls = [];
    let stored = scenario.savedToken;
    const context = vm.createContext({
      fields, readBackendSessionToken: async () => stored,
      writeBackendSessionToken: async (token) => { stored = token; fields.backendSessionToken.value = token; },
      backendRequest: async (endpoint, options, requireToken) => {
        calls.push({ endpoint, method: options.method, requireToken });
        if (scenario.fail) throw new Error("Backend unavailable");
      }
    });
    vm.runInContext(match[0], context);
    await context.logoutBackendAccount();
    assert.equal(calls.length, scenario.fieldToken || scenario.savedToken ? 1 : 0,
      "Logout must revoke a saved session even after the token input was cleared");
    if (calls.length) assert.deepEqual(calls[0], { endpoint: "/auth/logout", method: "POST", requireToken: true });
    assert.equal(stored, "");
    assert.equal(fields.backendPassword.value, "");
    assert.equal(fields.haiConnectorUrl.value, "");
    assert.equal(fields.backendStatus.textContent, "Signed out.");
  }
  console.log("Frontend backend logout and offline-clearing tests passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
