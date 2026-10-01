"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "e2e-session-secret-that-is-at-least-32-chars";
process.env.ADMIN_PASSWORD = "e2e-admin-password";
process.env.ADMIN_EMAIL = "admin@example.test";
process.env.REGISTRATION_MODE = "open";
process.env.HAI_CONNECTOR_ENABLED = "true";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.GOOGLE_API_KEY = "";
process.env.PROXY_ENDPOINT = "";

const { startBackendServer } = require("./backend-server");

async function call(baseUrl, method, route, body, token, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    signal: AbortSignal.timeout(10000),
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
  const databaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();
  const postgresTable = `e2e_test_${process.pid}_${Date.now()}`;
  const cleanupPool = databaseUrl ? new (require("pg").Pool)({ connectionString: databaseUrl, max: 1 }) : null;
  const options = {
    host: "127.0.0.1", port: 0, filePath: path.join(directory, "store.json"), runWorker: true, workerIntervalMs: 1000,
    storeType: databaseUrl ? "postgres" : "local", databaseUrl, postgresTable
  };
  let runtime;
  try {
    runtime = await startBackendServer(options);
    let baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
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
    let completed;
    const deadline = Date.now() + 10000;
    do {
      completed = await call(baseUrl, "GET", `/api/batch/jobs/${batch.data.job.id}`, undefined, owner.data.token);
      assert.equal(completed.status, 200);
      if (completed.data.job.status === "review-required") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
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
    const reviewed = await call(baseUrl, "POST", "/api/summaries/reviewed", {
      reviewed: true, haiApproved: true, title: "Reviewed end-to-end summary",
      content: "Owner reviewed this exact summary and approved it for HAI.",
      sourceUri: "https://trello.com/c/e2e123/verified-summary", runId: "e2e-reviewed"
    }, owner.data.token);
    assert.equal(reviewed.status, 201);
    const privateSummary = await call(baseUrl, "POST", "/api/summaries/reviewed", {
      reviewed: true, haiApproved: false, title: "Private summary", content: "Not approved for HAI.", runId: "e2e-private"
    }, owner.data.token);
    assert.equal(privateSummary.status, 201);
    const otherUserSummary = await call(baseUrl, "POST", "/api/summaries/reviewed", {
      reviewed: true, haiApproved: true, title: "Other user's summary", content: "Approved only by the other user.", runId: "e2e-other-user"
    }, member.data.token);
    assert.equal(otherUserSummary.status, 201);
    const connector = await call(baseUrl, "POST", "/api/integrations/hai/token", {}, owner.data.token);
    assert.equal(connector.status, 201);
    const beforeRestart = await call(baseUrl, "GET", connector.data.feedPath);
    assert.equal(beforeRestart.status, 200);
    assert.equal(beforeRestart.data.items.length, 1);
    assert.equal(beforeRestart.data.items[0].externalId, `summarize-this:${reviewed.data.summary.id}`);
    await runtime.shutdown();
    runtime = null;
    runtime = await startBackendServer(options);
    baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
    assert.equal((await call(baseUrl, "GET", "/api/user/profile", undefined, owner.data.token)).status, 200);
    const afterRestart = await call(baseUrl, "GET", connector.data.feedPath);
    assert.equal(afterRestart.status, 200);
    assert.deepEqual(afterRestart.data.items, beforeRestart.data.items);
    assert.equal(afterRestart.data.nextCursor, beforeRestart.data.nextCursor);
    const revocation = await call(baseUrl, "POST", `/api/summaries/${reviewed.data.summary.id}/hai-approval`, { approved: false }, owner.data.token);
    assert.equal(revocation.status, 200);
    assert.deepEqual((await call(baseUrl, "GET", connector.data.feedPath)).data.items, []);
    assert.equal((await call(baseUrl, "POST", "/api/auth/logout", {}, owner.data.token)).status, 200);
    assert.equal((await call(baseUrl, "GET", "/api/user/profile", undefined, owner.data.token)).status, 401);
  } finally {
    if (runtime) await runtime.shutdown();
    if (cleanupPool) {
      try { await cleanupPool.query(`DROP TABLE IF EXISTS "${postgresTable}"`); }
      finally { await cleanupPool.end(); }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log(`End-to-end ${databaseUrl ? "PostgreSQL" : "local"} backend, HAI privacy, restart persistence and logout tests passed.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
