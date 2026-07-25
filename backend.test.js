const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin-secret";
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.GOOGLE_API_KEY = "";
process.env.PROXY_ENDPOINT = "";

const { startBackendServer } = require("./backend-server");
const { DEFAULT_RUNTIME_STORE_PATH } = require("./backend-storage");

async function requestJson(baseUrl, method, path, body, headers = {}) {
  const target = new URL(`${baseUrl}${path}`);
  const payload = body === undefined ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers: Object.assign({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }, headers)
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (_error) {
          data = text;
        }
        resolve({ status: response.statusCode, data });
      });
    });

    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function main() {
  const filePath = path.join(os.tmpdir(), `summarize-this-backend-test-${Date.now()}.json`);
  const storagePathAlias = path.join(os.tmpdir(), `summarize-this-backend-alias-${Date.now()}.json`);
  const precedencePath = path.join(os.tmpdir(), `summarize-this-backend-precedence-${Date.now()}.json`);
  const { server } = await startBackendServer({ host: "127.0.0.1", port: 0, allowMissingEnv: false, filePath });
  const address = server.address();
  const baseUrl = `http://${address.address}:${address.port}`;
  const customUserEmail = "custom-file-path@test.example";

  try {
    const health = await requestJson(baseUrl, "GET", "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.status, "ok");

    const customRegister = await requestJson(baseUrl, "POST", "/api/auth/register", {
      email: customUserEmail,
      password: "custom-file-pass",
      name: "Custom File User"
    });
    assert.equal(customRegister.status, 201);
    assert.ok(customRegister.data.token);

    const readiness = await requestJson(baseUrl, "GET", "/api/readiness");
    assert.equal(readiness.status, 200);
    assert.equal(readiness.data.status, "ready");

    const login = await requestJson(baseUrl, "POST", "/api/auth/login", {
      email: "test@example.com",
      password: "correct-password"
    });
    assert.equal(login.status, 200);
    assert.ok(login.data.token);

    const token = login.data.token;
    const secondLogin = await requestJson(baseUrl, "POST", "/api/auth/login", {
      email: "test@example.com",
      password: "correct-password"
    });
    assert.equal(secondLogin.status, 200);
    assert.notEqual(secondLogin.data.token, token);

    const profile = await requestJson(baseUrl, "GET", "/api/user/profile", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.data.user.email, "test@example.com");

    const shortSummary = await requestJson(baseUrl, "POST", "/api/summarize", {
      text: "too short"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(shortSummary.status, 400);

    const proxyGuard = await requestJson(baseUrl, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      proxy: { enabled: true },
      provider: { apiKey: "browser-key-should-not-pass" }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(proxyGuard.status, 422);

    const directModeBlocked = await requestJson(baseUrl, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      provider: { apiKey: "browser-key-should-not-pass" }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(directModeBlocked.status, 422);

    const summary = await requestJson(baseUrl, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      method: "hybrid"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(summary.status, 200);
    assert.equal(summary.data.result.providerMode, "local");

    const idempotentSummaryFirst = await requestJson(baseUrl, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      method: "hybrid"
    }, {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "contract-summary-1"
    });
    const idempotentSummarySecond = await requestJson(baseUrl, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      method: "hybrid"
    }, {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "contract-summary-1"
    });
    assert.equal(idempotentSummaryFirst.status, 200);
    assert.equal(idempotentSummarySecond.status, 200);
    assert.equal(idempotentSummaryFirst.data.result.id, idempotentSummarySecond.data.result.id);

    const credits = await requestJson(baseUrl, "GET", "/api/user/credits", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(credits.status, 200);
    assert.equal(typeof credits.data.credits, "number");

    const activity = await requestJson(baseUrl, "GET", "/api/user/activity", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(activity.status, 200);
    assert.ok(Array.isArray(activity.data.activities));

    const purchase = await requestJson(baseUrl, "POST", "/api/credits/purchase", {
      package: "basic",
      paymentMethodId: "pm_test"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(purchase.status, 200);

    const idempotentPurchaseOne = await requestJson(baseUrl, "POST", "/api/credits/purchase", {
      package: "basic",
      paymentMethodId: "pm_test_repeat"
    }, {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "contract-purchase-1"
    });
    const idempotentPurchaseTwo = await requestJson(baseUrl, "POST", "/api/credits/purchase", {
      package: "basic",
      paymentMethodId: "pm_test_repeat"
    }, {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "contract-purchase-1"
    });
    assert.equal(idempotentPurchaseOne.status, 200);
    assert.equal(idempotentPurchaseTwo.status, 200);
    assert.equal(idempotentPurchaseOne.data.transaction.id, idempotentPurchaseTwo.data.transaction.id);

    const batchCreated = await requestJson(baseUrl, "POST", "/api/batch/jobs", {
      aiHandoffApproved: true,
      listName: "Contract test list",
      cards: [
        { id: "card-1", name: "Card one" },
        { id: "card-2", name: "Card two" }
      ],
      concurrency: 1
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchCreated.status, 201);
    assert.equal(batchCreated.data.job.cards.length, 2);
    assert.equal(batchCreated.data.job.listName, "Contract test list");

    const batchList = await requestJson(baseUrl, "GET", "/api/batch/jobs", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchList.status, 200);
    assert.ok(batchList.data.jobs.some((item) => item.id === batchCreated.data.job.id));

    const batchGet = await requestJson(baseUrl, "GET", `/api/batch/jobs/${batchCreated.data.job.id}`, undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchGet.status, 200);
    assert.equal(batchGet.data.job.id, batchCreated.data.job.id);

    const batchStart = await requestJson(baseUrl, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/start`, {}, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchStart.status, 200);
    assert.equal(batchStart.data.job.status, "running");

    const batchCardOpened = await requestJson(baseUrl, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-1`, {
      status: "opened",
      attemptsDelta: 1
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchCardOpened.status, 200);
    assert.equal(batchCardOpened.data.card.status, "opened");
    assert.equal(batchCardOpened.data.card.attempts, 1);

    const batchCardAnalyzed = await requestJson(baseUrl, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-1`, {
      status: "analyzed",
      result: {
        summary: "Reviewed card one",
        confidence: 0.81
      }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchCardAnalyzed.status, 200);
    assert.equal(batchCardAnalyzed.data.card.status, "analyzed");
    assert.equal(batchCardAnalyzed.data.card.result.summary, "Reviewed card one");

    const batchMarkedPartial = await requestJson(baseUrl, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/status`, {
      status: "running",
      summary: "Manual popup runner in progress"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchMarkedPartial.status, 200);
    assert.equal(batchMarkedPartial.data.job.summary, "Manual popup runner in progress");

    const batchRun = await requestJson(baseUrl, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/run`, {}, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchRun.status, 200);
    assert.equal(batchRun.data.job.status, "completed");
    assert.equal(batchRun.data.job.cards.every((item) => item.status === "completed"), true);

    const webhookMissing = await requestJson(baseUrl, "POST", "/api/webhooks/stripe", {});
    assert.equal(webhookMissing.status, 400);

    const webhookSigned = await requestJson(baseUrl, "POST", "/api/webhooks/stripe", {}, {
      "stripe-signature": "test-signature"
    });
    assert.ok(webhookSigned.status === 200 || webhookSigned.status === 202);

    const adminLogin = await requestJson(baseUrl, "POST", "/api/admin/auth/login", {
      email: "admin@example.com",
      password: "admin-secret"
    });
    assert.equal(adminLogin.status, 200);
    assert.ok(adminLogin.data.token);
    const adminToken = adminLogin.data.token;

    const adminRefresh = await requestJson(baseUrl, "POST", "/api/admin/auth/refresh", {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(adminRefresh.status, 200);
    assert.ok(adminRefresh.data.token);
    const refreshedAdminToken = adminRefresh.data.token;

    const unauthorizedMetrics = await requestJson(baseUrl, "GET", "/api/admin/dashboard/metrics");
    assert.equal(unauthorizedMetrics.status, 401);

    const adminHealth = await requestJson(baseUrl, "GET", "/api/admin/system/health", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(adminHealth.status, 200);
    assert.equal(adminHealth.data.status, "ok");

    const users = await requestJson(baseUrl, "GET", "/api/admin/users", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(users.status, 200);
    assert.ok(Array.isArray(users.data.users));

    const userId = users.data.users[0].id;
    const updateUser = await requestJson(baseUrl, "PUT", `/api/admin/users/${userId}`, {
      name: "Updated Test User"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(updateUser.status, 200);
    assert.equal(updateUser.data.user.name, "Updated Test User");

    const suspendUser = await requestJson(baseUrl, "POST", `/api/admin/users/${userId}/suspend`, {
      reason: "contract test"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(suspendUser.status, 200);

    const unsuspendUser = await requestJson(baseUrl, "POST", `/api/admin/users/${userId}/unsuspend`, {}, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(unsuspendUser.status, 200);

    const adjustCredits = await requestJson(baseUrl, "POST", `/api/admin/users/${userId}/credits/adjust`, {
      amount: 7,
      reason: "manual test adjustment"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`,
      "Idempotency-Key": "contract-admin-credit-1"
    });
    assert.equal(adjustCredits.status, 200);
    assert.equal(adjustCredits.data.transaction.type, "admin_credit_adjustment");

    const adjustCreditsRepeat = await requestJson(baseUrl, "POST", `/api/admin/users/${userId}/credits/adjust`, {
      amount: 7,
      reason: "manual test adjustment"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`,
      "Idempotency-Key": "contract-admin-credit-1"
    });
    assert.equal(adjustCreditsRepeat.status, 200);
    assert.equal(adjustCreditsRepeat.data.transaction.id, adjustCredits.data.transaction.id);

    const bulkAdjust = await requestJson(baseUrl, "POST", "/api/admin/credits/bulk-adjust", {
      adjustments: [{ userId, amount: 3, reason: "bulk contract test" }]
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(bulkAdjust.status, 200);
    assert.equal(bulkAdjust.data.results[0].success, true);

    const transactions = await requestJson(baseUrl, "GET", "/api/admin/transactions", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(transactions.status, 200);
    assert.ok(Array.isArray(transactions.data.transactions));

    const transactionId = transactions.data.transactions[0].id;
    const review = await requestJson(baseUrl, "POST", `/api/admin/transactions/${transactionId}/review`, {
      notes: "Reviewed in contract test"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(review.status, 200);

    const refund = await requestJson(baseUrl, "POST", `/api/admin/transactions/${transactionId}/refund`, {
      reason: "contract test refund"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(refund.status, 200);

    const audit = await requestJson(baseUrl, "GET", "/api/admin/audit", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.data.events));
    assert.ok(Array.isArray(audit.data.reviews));

    const settings = await requestJson(baseUrl, "GET", "/api/admin/settings", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(settings.status, 200);

    const updateSettings = await requestJson(baseUrl, "PUT", "/api/admin/settings", {
      providerMode: "local",
      proxyEndpoint: ""
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(updateSettings.status, 200);

    const settingsHistory = await requestJson(baseUrl, "GET", "/api/admin/settings/history", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(settingsHistory.status, 200);
    assert.ok(Array.isArray(settingsHistory.data.history));

    const analytics = await requestJson(baseUrl, "GET", "/api/admin/analytics", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(analytics.status, 200);

    const userAnalytics = await requestJson(baseUrl, "GET", "/api/admin/analytics/users", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(userAnalytics.status, 200);

    const revenueAnalytics = await requestJson(baseUrl, "GET", "/api/admin/analytics/revenue", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(revenueAnalytics.status, 200);

    const usageAnalytics = await requestJson(baseUrl, "GET", "/api/admin/analytics/usage", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(usageAnalytics.status, 200);

    const report = await requestJson(baseUrl, "POST", "/api/admin/reports/generate", {
      type: "usage",
      parameters: { window: "7d" }
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(report.status, 200);
    const reportId = report.data.report.id;

    const reports = await requestJson(baseUrl, "GET", "/api/admin/reports", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(reports.status, 200);

    const reportDownload = await requestJson(baseUrl, "GET", `/api/admin/reports/${reportId}/download`, undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(reportDownload.status, 200);

    const backup = await requestJson(baseUrl, "POST", "/api/admin/backup/create", {
      type: "full"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(backup.status, 200);
    const backupId = backup.data.backup.id;

    const backups = await requestJson(baseUrl, "GET", "/api/admin/backup/list", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(backups.status, 200);

    const restoreBackup = await requestJson(baseUrl, "POST", `/api/admin/backup/${backupId}/restore`, {}, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(restoreBackup.status, 200);

    const maintenance = await requestJson(baseUrl, "POST", "/api/admin/maintenance/schedule", {
      startsAt: "2026-07-20T10:00:00.000Z",
      endsAt: "2026-07-20T11:00:00.000Z",
      note: "contract maintenance"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(maintenance.status, 200);

    const maintenanceWindows = await requestJson(baseUrl, "GET", "/api/admin/maintenance/windows", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(maintenanceWindows.status, 200);

    const restartService = await requestJson(baseUrl, "POST", "/api/admin/system/services/api/restart", {}, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(restartService.status, 200);

    const alerts = await requestJson(baseUrl, "GET", "/api/admin/system/alerts", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(alerts.status, 200);
    assert.ok(Array.isArray(alerts.data.alerts));

    if (alerts.data.alerts.length) {
      const acknowledgeAlert = await requestJson(baseUrl, "POST", `/api/admin/system/alerts/${alerts.data.alerts[0].id}/acknowledge`, {}, {
        Authorization: `Bearer ${refreshedAdminToken}`
      });
      assert.equal(acknowledgeAlert.status, 200);
    }

    const logout = await requestJson(baseUrl, "POST", "/api/auth/logout", {}, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(logout.status, 200);
    const profileAfterLogout = await requestJson(baseUrl, "GET", "/api/user/profile", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(profileAfterLogout.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.equal(fs.existsSync(filePath), true);
  const customStore = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.ok(Array.isArray(customStore.users));
  assert.ok(customStore.users.some((item) => item.email === customUserEmail));

  if (fs.existsSync(DEFAULT_RUNTIME_STORE_PATH)) {
    const runtimeStore = JSON.parse(fs.readFileSync(DEFAULT_RUNTIME_STORE_PATH, "utf8"));
    assert.ok(!runtimeStore.users.some((item) => item.email === customUserEmail));
  }

  fs.rmSync(filePath, { force: true });

  const { server: aliasServer } = await startBackendServer({
    host: "127.0.0.1",
    port: 0,
    allowMissingEnv: false,
    storagePath: storagePathAlias
  });
  const aliasAddress = aliasServer.address();
  const aliasBaseUrl = `http://${aliasAddress.address}:${aliasAddress.port}`;

  try {
    const aliasRegister = await requestJson(aliasBaseUrl, "POST", "/api/auth/register", {
      email: "storage-alias@test.example",
      password: "alias-pass",
      name: "Storage Alias User"
    });
    assert.equal(aliasRegister.status, 201);
  } finally {
    await new Promise((resolve) => aliasServer.close(resolve));
  }

  assert.equal(fs.existsSync(storagePathAlias), true);
  const aliasStore = JSON.parse(fs.readFileSync(storagePathAlias, "utf8"));
  assert.ok(aliasStore.users.some((item) => item.email === "storage-alias@test.example"));
  fs.rmSync(storagePathAlias, { force: true });

  const { server: precedenceServer } = await startBackendServer({
    host: "127.0.0.1",
    port: 0,
    allowMissingEnv: false,
    filePath: precedencePath,
    storagePath: storagePathAlias
  });
  const precedenceAddress = precedenceServer.address();
  const precedenceBaseUrl = `http://${precedenceAddress.address}:${precedenceAddress.port}`;

  try {
    const precedenceRegister = await requestJson(precedenceBaseUrl, "POST", "/api/auth/register", {
      email: "precedence@test.example",
      password: "precedence-pass",
      name: "Precedence User"
    });
    assert.equal(precedenceRegister.status, 201);
  } finally {
    await new Promise((resolve) => precedenceServer.close(resolve));
  }

  assert.equal(fs.existsSync(precedencePath), true);
  const precedenceStore = JSON.parse(fs.readFileSync(precedencePath, "utf8"));
  assert.ok(precedenceStore.users.some((item) => item.email === "precedence@test.example"));
  if (fs.existsSync(storagePathAlias)) {
    const aliasAfterPrecedence = JSON.parse(fs.readFileSync(storagePathAlias, "utf8"));
    assert.ok(!aliasAfterPrecedence.users.some((item) => item.email === "precedence@test.example"));
  }
  fs.rmSync(precedencePath, { force: true });
  fs.rmSync(storagePathAlias, { force: true });

  console.log("Backend contract tests passed.");
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
