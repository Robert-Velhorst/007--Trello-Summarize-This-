"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "large-dataset-secret-that-is-at-least-32-chars";
process.env.ADMIN_PASSWORD = "large-admin-password";
process.env.ADMIN_EMAIL = "admin@example.test";

const { startBackendServer } = require("./backend-server");

async function main() {
  const directory = path.join(os.tmpdir(), `summarize-this-large-${process.pid}-${Date.now()}`);
  const { server, app } = await startBackendServer({ host: "127.0.0.1", port: 0, filePath: path.join(directory, "store.json") });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const createdAt = new Date().toISOString();
    const users = Array.from({ length: 5_000 }, (_item, index) => ({
      id: `user-${String(index).padStart(5, "0")}`,
      email: `user-${String(index).padStart(5, "0")}@example.test`,
      name: index === 4_321 ? "Unique Pagination Target" : `Dataset User ${index}`,
      role: "user",
      credits: 10,
      suspended: false,
      createdAt,
      updatedAt: createdAt
    }));
    await app.store.replace("users", users);

    const loginResponse = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200);

    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}/api/admin/users?q=unique%20pagination&limit=10&offset=0&sort=email:asc`, {
      headers: { Authorization: `Bearer ${login.token}` }
    });
    const result = await response.json();
    const durationMs = performance.now() - startedAt;
    assert.equal(response.status, 200);
    assert.equal(result.total, 1);
    assert.equal(result.users[0].id, "user-04321");
    assert.equal(result.limit, 10);
    assert.ok(durationMs < 2_000, `Large-dataset query took ${durationMs.toFixed(1)} ms`);

    const pageResponse = await fetch(`${baseUrl}/api/admin/users?limit=100&offset=4900`, {
      headers: { Authorization: `Bearer ${login.token}` }
    });
    const page = await pageResponse.json();
    assert.equal(page.total, 5_000);
    assert.equal(page.users.length, 100);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("Large-dataset pagination test passed.");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
