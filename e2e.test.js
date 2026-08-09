"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "e2e-session-secret-that-is-at-least-32-chars";
process.env.ADMIN_PASSWORD = "e2e-admin-password";
process.env.ADMIN_EMAIL = "admin@example.test";

const { startBackendServer } = require("./backend-server");
const { processWorkerCycle } = require("./backend-worker");

async function call(baseUrl, method, route, body, token, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: Object.assign({
      "Content-Type": "application/json"
    }, token ? { Authorization: `Bearer ${token}` } : {}, headers),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function main() {
  const directory = path.join(os.tmpdir(), `summarize-this-e2e-${process.pid}-${Date.now()}`);
  const { server, app } = await startBackendServer({ host: "127.0.0.1", port: 0, filePath: path.join(directory, "store.json") });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await call(baseUrl, "GET", "/api/health")).status, 200);
    const owner = await call(baseUrl, "POST", "/api/auth/register", { email: "owner@example.test", password: "owner-password-123", name: "Owner" });
    const member = await call(baseUrl, "POST", "/api/auth/register", { email: "member@example.test", password: "member-password-123", name: "Member" });
    assert.equal(owner.status, 201);
    assert.equal(member.status, 201);

    const workspaces = await call(baseUrl, "GET", "/api/workspaces", undefined, owner.data.token);
    assert.equal(workspaces.status, 200);
    const workspaceId = workspaces.data.workspaces[0].id;
    const membership = await call(baseUrl, "POST", `/api/workspaces/${workspaceId}/members`, { email: "member@example.test", role: "viewer" }, owner.data.token);
    assert.equal(membership.status, 200);
    assert.equal(membership.data.membership.role, "viewer");

    const sourceText = "This is explicit source text for the end-to-end summary and it is deliberately long enough to pass validation.";
    const summary = await call(baseUrl, "POST", "/api/summarize", { text: sourceText }, owner.data.token, { "Idempotency-Key": "e2e-summary-1" });
    assert.equal(summary.status, 200);
    assert.equal(summary.data.result.providerMode, "local");
    assert.equal(summary.data.result.creditsUsed, 0);
    assert.equal(summary.data.result.evidence.unsupportedClaims.length, 0);
    for (let index = 0; index < 3; index += 1) {
      const repeated = await call(baseUrl, "POST", "/api/summarize", { text: `${sourceText} Repeated local request ${index}.` }, owner.data.token);
      assert.equal(repeated.status, 200);
      assert.equal(repeated.data.result.creditsUsed, 0);
    }
    assert.equal((await call(baseUrl, "GET", "/api/user/credits", undefined, owner.data.token)).data.credits, 10);
    const sharedSummaries = await call(baseUrl, "GET", `/api/workspaces/${workspaceId}/summaries`, undefined, member.data.token);
    assert.equal(sharedSummaries.status, 200);
    assert.equal(sharedSummaries.data.total, 4);
    assert.equal((await call(baseUrl, "PUT", `/api/workspaces/${workspaceId}`, { name: "Viewer cannot rename" }, member.data.token)).status, 403);
    const renamed = await call(baseUrl, "PUT", `/api/workspaces/${workspaceId}`, { name: "E2E workspace" }, owner.data.token);
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.workspace.name, "E2E workspace");

    const batch = await call(baseUrl, "POST", "/api/batch/jobs", {
      executionMode: "local-worker",
      executionApproved: true,
      cards: [{ id: "e2e-card", name: "E2E card", inputText: sourceText }]
    }, owner.data.token);
    assert.equal(batch.status, 201);
    assert.equal((await call(baseUrl, "POST", `/api/batch/jobs/${batch.data.job.id}/run`, {}, owner.data.token)).status, 202);
    await processWorkerCycle(app.store);
    const completed = await call(baseUrl, "GET", `/api/batch/jobs/${batch.data.job.id}`, undefined, owner.data.token);
    assert.equal(completed.data.job.status, "review-required");

    const admin = await call(baseUrl, "POST", "/api/admin/auth/login", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    assert.equal(admin.status, 200);
    const backup = await call(baseUrl, "POST", "/api/admin/backup/create", { reason: "e2e" }, admin.data.token, { "Idempotency-Key": "e2e-backup-1" });
    assert.equal(backup.status, 201);
    assert.equal(backup.data.backup.verified, true);
    const support = await call(baseUrl, "GET", "/api/admin/support-bundle", undefined, admin.data.token);
    assert.equal(support.status, 200);
    assert.equal(JSON.stringify(support.data).includes("owner@example.test"), false);
    const removedMember = await call(baseUrl, "DELETE", `/api/workspaces/${workspaceId}/members/${member.data.user.id}`, {}, owner.data.token);
    assert.equal(removedMember.status, 200);
    assert.equal((await call(baseUrl, "GET", `/api/workspaces/${workspaceId}/summaries`, undefined, member.data.token)).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("End-to-end backend test passed.");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
