const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin-secret";
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.GOOGLE_API_KEY = "";
process.env.PROXY_ENDPOINT = "";
process.env.DATABASE_URL = "";

const { createBackendApp } = require("./backend-app");
const { DEFAULT_RUNTIME_STORE_PATH, LocalBackendStore } = require("./backend-storage");

function sessionTokenHash(token) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(token).digest("hex");
}

async function requestJson(app, method, targetPath, body, headers = {}, rawBody) {
  const payload = rawBody === undefined ? (body === undefined ? "" : JSON.stringify(body)) : String(rawBody);
  const normalizedHeaders = Object.fromEntries(
    Object.entries(Object.assign({
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }, headers)).map(([key, value]) => [key.toLowerCase(), value])
  );

  const req = new PassThrough();
  req.method = method;
  req.url = targetPath;
  req.headers = normalizedHeaders;
  req.socket = { remoteAddress: "127.0.0.1" };

  const res = new PassThrough();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => {
    res.headers[String(name).toLowerCase()] = value;
  };
  res.getHeader = (name) => res.headers[String(name).toLowerCase()];
  res.writeHead = (statusCode, responseHeaders = {}) => {
    res.statusCode = statusCode;
    Object.entries(responseHeaders).forEach(([name, value]) => res.setHeader(name, value));
    return res;
  };

  const chunks = [];
  const responsePromise = new Promise((resolve, reject) => {
    res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    res.on("finish", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_error) {
        data = text;
      }
      resolve({ status: res.statusCode, data, headers: res.headers });
    });
    res.on("error", reject);
  });

  if (payload) {
    req.end(payload);
  } else {
    req.end();
  }

  await app.handle(req, res);
  return responsePromise;
}

async function main() {
  const storageDirectory = path.join(os.tmpdir(), `summarize-this-backend-test-${Date.now()}`);
  const filePath = path.join(storageDirectory, "store.json");
  const storagePathAlias = path.join(os.tmpdir(), `summarize-this-backend-alias-${Date.now()}.json`);
  const precedencePath = path.join(os.tmpdir(), `summarize-this-backend-precedence-${Date.now()}.json`);
  const databaseUrlPath = path.join(os.tmpdir(), `summarize-this-backend-db-url-${Date.now()}.json`);
  const app = await createBackendApp({ filePath });
  const customUserEmail = "custom-file-path@test.example";
  const secondaryUserEmail = "secondary-user@test.example";

  const health = await requestJson(app, "GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "ok");
  assert.equal(health.data.storage.users, 0);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(storageDirectory).mode & 0o077, 0);
    assert.equal(fs.statSync(filePath).mode & 0o077, 0);
  }

  const expiredToken = "expired-contract-token";
  await app.store.createSession({
    userId: "missing-user",
    role: "user",
    tokenHash: sessionTokenHash(expiredToken),
    expiresAt: "2000-01-01T00:00:00.000Z"
  });
  const expiredSessionRequest = await requestJson(app, "GET", "/api/user/profile", undefined, {
    Authorization: `Bearer ${expiredToken}`
  });
  assert.equal(expiredSessionRequest.status, 401);
  const expiredSession = (await app.store.list("sessions")).find((item) => item.tokenHash === sessionTokenHash(expiredToken));
  assert.ok(expiredSession.revokedAt);
  const healthAfterExpiredSession = await requestJson(app, "GET", "/api/health");
  assert.equal(healthAfterExpiredSession.data.storage.sessions, 0);

  const invalidJson = await requestJson(app, "POST", "/api/auth/register", undefined, {}, "{");
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.data.error, "Invalid JSON body");

  const allowedPreflight = await requestJson(app, "OPTIONS", "/api/user/profile", undefined, {
    Origin: "http://127.0.0.1:17117"
  });
  assert.equal(allowedPreflight.status, 204);
  assert.equal(allowedPreflight.headers["access-control-allow-origin"], "http://127.0.0.1:17117");
  assert.equal(allowedPreflight.headers.vary, "Origin");

  const rejectedOrigin = await requestJson(app, "GET", "/api/health", undefined, {
    Origin: "https://untrusted.example"
  });
  assert.equal(rejectedOrigin.status, 403);
  assert.equal(rejectedOrigin.headers["access-control-allow-origin"], undefined);

  const invalidRegister = await requestJson(app, "POST", "/api/auth/register", {
    email: "not-an-email",
    password: "custom-file-pass",
    name: "Invalid Email User"
  });
  assert.equal(invalidRegister.status, 400);

  const customRegister = await requestJson(app, "POST", "/api/auth/register", {
    email: customUserEmail,
    password: "custom-file-pass",
    name: "Custom File User"
  });
  assert.equal(customRegister.status, 201);
  assert.ok(customRegister.data.token);
  const storedRegistrationSession = (await app.store.list("sessions")).find((item) => item.userId === customRegister.data.user.id);
  assert.equal(storedRegistrationSession.tokenHash, sessionTokenHash(customRegister.data.token));
  assert.notEqual(storedRegistrationSession.tokenHash, crypto.createHash("sha256").update(customRegister.data.token).digest("hex"));

  const secondaryRegister = await requestJson(app, "POST", "/api/auth/register", {
    email: secondaryUserEmail,
    password: "secondary-file-pass",
    name: "Secondary Test User"
  });
  assert.equal(secondaryRegister.status, 201);

  const predictableBootstrapLogin = await requestJson(app, "POST", "/api/auth/login", {
    email: "test@example.com",
    password: "correct-password"
  });
  assert.equal(predictableBootstrapLogin.status, 401);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const failedLogin = await requestJson(app, "POST", "/api/auth/login", {
      email: "rate-limited-login@test.example",
      password: "incorrect-password"
    });
    assert.equal(failedLogin.status, 401);
  }
  const throttledLogin = await requestJson(app, "POST", "/api/auth/login", {
    email: "rate-limited-login@test.example",
    password: "incorrect-password"
  });
  assert.equal(throttledLogin.status, 429);

  const readiness = await requestJson(app, "GET", "/api/readiness");
  assert.equal(readiness.status, 200);
  assert.equal(readiness.data.status, "ready");

  const login = await requestJson(app, "POST", "/api/auth/login", {
    email: customUserEmail,
    password: "custom-file-pass"
  });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);

  const token = login.data.token;
  const secondLogin = await requestJson(app, "POST", "/api/auth/login", {
    email: customUserEmail,
    password: "custom-file-pass"
  });
  assert.equal(secondLogin.status, 200);
  assert.notEqual(secondLogin.data.token, token);

  const profile = await requestJson(app, "GET", "/api/user/profile", undefined, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.user.email, customUserEmail);

  const shortSummary = await requestJson(app, "POST", "/api/summarize", {
    text: "too short"
  }, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(shortSummary.status, 400);

    const proxyGuard = await requestJson(app, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      proxy: { enabled: true },
      provider: { apiKey: "browser-key-should-not-pass" }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(proxyGuard.status, 422);

    const directModeBlocked = await requestJson(app, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      provider: { apiKey: "browser-key-should-not-pass" }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(directModeBlocked.status, 422);

    const summary = await requestJson(app, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      method: "hybrid"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(summary.status, 200);
    assert.equal(summary.data.result.providerMode, "local");
    assert.deepEqual(summary.data.result.evidence.inferences, []);
    assert.equal(summary.data.result.evidence.facts[0].source, "submitted text");
    assert.ok(summary.data.result.evidence.uncertainty.length > 0);

    const providerRequest = await requestJson(app, "POST", "/api/summarize", {
      text: "This text is definitely long enough to prove that unsupported provider execution is rejected by the backend.",
      provider: { apiKey: "browser-key-must-not-be-used" }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(providerRequest.status, 422);
    assert.match(providerRequest.data.error, /only supports deterministic local summaries/i);

    const idempotentSummaryFirst = await requestJson(app, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      method: "hybrid"
    }, {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "contract-summary-1"
    });
    const idempotentSummarySecond = await requestJson(app, "POST", "/api/summarize", {
      text: "This text is definitely long enough to be summarized safely in the backend contract test case.",
      method: "hybrid"
    }, {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "contract-summary-1"
    });
    assert.equal(idempotentSummaryFirst.status, 200);
    assert.equal(idempotentSummarySecond.status, 200);
    assert.equal(idempotentSummaryFirst.data.result.id, idempotentSummarySecond.data.result.id);

    const credits = await requestJson(app, "GET", "/api/user/credits", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(credits.status, 200);
    assert.equal(typeof credits.data.credits, "number");

    const activity = await requestJson(app, "GET", "/api/user/activity", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(activity.status, 200);
    assert.ok(Array.isArray(activity.data.activities));

    const purchase = await requestJson(app, "POST", "/api/credits/purchase", {
      package: "basic",
      paymentMethodId: "pm_test"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(purchase.status, 503);
    assert.match(purchase.data.error, /no verified payment processor/i);

    const batchCreated = await requestJson(app, "POST", "/api/batch/jobs", {
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

    const batchList = await requestJson(app, "GET", "/api/batch/jobs", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchList.status, 200);
    assert.ok(batchList.data.jobs.some((item) => item.id === batchCreated.data.job.id));

    const batchGet = await requestJson(app, "GET", `/api/batch/jobs/${batchCreated.data.job.id}`, undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchGet.status, 200);
    assert.equal(batchGet.data.job.id, batchCreated.data.job.id);

    const batchStart = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/start`, {}, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchStart.status, 200);
    assert.equal(batchStart.data.job.status, "running");

    const batchCardOpened = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-1`, {
      status: "opened",
      attemptsDelta: 1
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchCardOpened.status, 200);
    assert.equal(batchCardOpened.data.card.status, "opened");
    assert.equal(batchCardOpened.data.card.attempts, 1);

    const fabricatedCompletedCard = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-1`, {
      status: "completed"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(fabricatedCompletedCard.status, 422);
    assert.match(fabricatedCompletedCard.data.error, /recognized reviewed-workflow state/i);

    const analyzedWithoutResult = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-1`, {
      status: "analyzed"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(analyzedWithoutResult.status, 422);
    assert.match(analyzedWithoutResult.data.error, /requires an observed result object/i);

    const batchCardAnalyzed = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-1`, {
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

    const batchMarkedPartial = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/status`, {
      status: "running",
      summary: "Manual popup runner in progress"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchMarkedPartial.status, 200);
    assert.equal(batchMarkedPartial.data.job.summary, "Manual popup runner in progress");

    const batchCardTwoAnalyzed = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/cards/card-2`, {
      status: "analyzed",
      result: {
        summary: "Reviewed card two",
        confidence: 0.73
      }
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchCardTwoAnalyzed.status, 200);

    const batchReviewRequired = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/status`, {
      summary: "2 card(s) analyzed and require human review. Trello write actions remained off."
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchReviewRequired.status, 200);
    assert.equal(batchReviewRequired.data.job.status, "review-required");

    const directCompletionClaim = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/status`, {
      status: "completed"
    }, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(directCompletionClaim.status, 422);
    assert.match(directCompletionClaim.data.error, /derived from recorded card outcomes/i);

    const batchRun = await requestJson(app, "POST", `/api/batch/jobs/${batchCreated.data.job.id}/run`, {}, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(batchRun.status, 409);
    assert.match(batchRun.data.error, /reviewed Power-Up workflow/i);
    assert.equal(batchRun.data.job.cards.some((item) => item.status === "completed"), false);

    const webhookMissing = await requestJson(app, "POST", "/api/webhooks/stripe", {});
    assert.equal(webhookMissing.status, 503);

    const webhookSigned = await requestJson(app, "POST", "/api/webhooks/stripe", {}, {
      "stripe-signature": "test-signature"
    });
    assert.equal(webhookSigned.status, 503);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedAdminLogin = await requestJson(app, "POST", "/api/admin/auth/login", {
        email: "rate-limited-admin@test.example",
        password: "incorrect-password"
      });
      assert.equal(failedAdminLogin.status, 401);
    }
    const throttledAdminLogin = await requestJson(app, "POST", "/api/admin/auth/login", {
      email: "rate-limited-admin@test.example",
      password: "incorrect-password"
    });
    assert.equal(throttledAdminLogin.status, 429);

    const adminLogin = await requestJson(app, "POST", "/api/admin/auth/login", {
      email: "admin@example.com",
      password: "admin-secret"
    });
    assert.equal(adminLogin.status, 200);
    assert.ok(adminLogin.data.token);
    const adminToken = adminLogin.data.token;

    const adminRefresh = await requestJson(app, "POST", "/api/admin/auth/refresh", {}, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.equal(adminRefresh.status, 200);
    assert.ok(adminRefresh.data.token);
    const refreshedAdminToken = adminRefresh.data.token;

    const unauthorizedMetrics = await requestJson(app, "GET", "/api/admin/dashboard/metrics");
    assert.equal(unauthorizedMetrics.status, 401);

    const adminHealth = await requestJson(app, "GET", "/api/admin/system/health", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(adminHealth.status, 200);
    assert.equal(adminHealth.data.status, "ok");

    const users = await requestJson(app, "GET", "/api/admin/users", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(users.status, 200);
    assert.ok(Array.isArray(users.data.users));

    const userId = users.data.users[0].id;
    const updateUser = await requestJson(app, "PUT", `/api/admin/users/${userId}`, {
      name: "Updated Test User"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(updateUser.status, 200);
    assert.equal(updateUser.data.user.name, "Updated Test User");
    assert.equal(updateUser.data.user.email, customUserEmail);

    const roleMutation = await requestJson(app, "PUT", `/api/admin/users/${userId}`, {
      role: "admin"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(roleMutation.status, 422);
    assert.match(roleMutation.data.error, /not mutable/i);

    const userRoleAfterMutation = await requestJson(app, "GET", `/api/admin/users/${userId}`, undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(userRoleAfterMutation.status, 200);
    assert.equal(userRoleAfterMutation.data.user.role, "user");

    const invalidAdminEmail = await requestJson(app, "PUT", `/api/admin/users/${userId}`, {
      email: "not-an-email"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(invalidAdminEmail.status, 400);

    const duplicateAdminEmail = await requestJson(app, "PUT", `/api/admin/users/${userId}`, {
      email: secondaryUserEmail
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(duplicateAdminEmail.status, 409);

    const suspendUser = await requestJson(app, "POST", `/api/admin/users/${userId}/suspend`, {
      reason: "contract test"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(suspendUser.status, 200);

    const unsuspendUser = await requestJson(app, "POST", `/api/admin/users/${userId}/unsuspend`, {}, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(unsuspendUser.status, 200);

    const adjustCredits = await requestJson(app, "POST", `/api/admin/users/${userId}/credits/adjust`, {
      amount: 7,
      reason: "manual test adjustment"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`,
      "Idempotency-Key": "contract-admin-credit-1"
    });
    assert.equal(adjustCredits.status, 200);
    assert.equal(adjustCredits.data.transaction.type, "admin_credit_adjustment");

    const adjustCreditsRepeat = await requestJson(app, "POST", `/api/admin/users/${userId}/credits/adjust`, {
      amount: 7,
      reason: "manual test adjustment"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`,
      "Idempotency-Key": "contract-admin-credit-1"
    });
    assert.equal(adjustCreditsRepeat.status, 200);
    assert.equal(adjustCreditsRepeat.data.transaction.id, adjustCredits.data.transaction.id);

    const bulkAdjust = await requestJson(app, "POST", "/api/admin/credits/bulk-adjust", {
      adjustments: [{ userId, amount: 3, reason: "bulk contract test" }]
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(bulkAdjust.status, 200);
    assert.equal(bulkAdjust.data.results[0].success, true);

    const transactions = await requestJson(app, "GET", "/api/admin/transactions", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(transactions.status, 200);
    assert.ok(Array.isArray(transactions.data.transactions));

    const transactionId = transactions.data.transactions[0].id;
    const review = await requestJson(app, "POST", `/api/admin/transactions/${transactionId}/review`, {
      notes: "Reviewed in contract test"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(review.status, 200);

    const refund = await requestJson(app, "POST", `/api/admin/transactions/${transactionId}/refund`, {
      reason: "contract test refund"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(refund.status, 503);
    assert.match(refund.data.error, /cannot verify or execute a payment-provider refund/i);

    const audit = await requestJson(app, "GET", "/api/admin/audit", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.data.events));
    assert.ok(Array.isArray(audit.data.reviews));

    const settings = await requestJson(app, "GET", "/api/admin/settings", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(settings.status, 200);

    const updateSettings = await requestJson(app, "PUT", "/api/admin/settings", {
      providerMode: "local",
      proxyEndpoint: ""
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(updateSettings.status, 200);

    const settingsHistory = await requestJson(app, "GET", "/api/admin/settings/history", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(settingsHistory.status, 200);
    assert.ok(Array.isArray(settingsHistory.data.history));

    const analytics = await requestJson(app, "GET", "/api/admin/analytics", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(analytics.status, 200);

    const userAnalytics = await requestJson(app, "GET", "/api/admin/analytics/users", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(userAnalytics.status, 200);

    const revenueAnalytics = await requestJson(app, "GET", "/api/admin/analytics/revenue", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(revenueAnalytics.status, 200);

    const usageAnalytics = await requestJson(app, "GET", "/api/admin/analytics/usage", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(usageAnalytics.status, 200);

    const report = await requestJson(app, "POST", "/api/admin/reports/generate", {
      type: "usage",
      parameters: { window: "7d" }
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(report.status, 200);
    const reportId = report.data.report.id;

    const reports = await requestJson(app, "GET", "/api/admin/reports", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(reports.status, 200);

    const reportDownload = await requestJson(app, "GET", `/api/admin/reports/${reportId}/download`, undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(reportDownload.status, 200);

    const backup = await requestJson(app, "POST", "/api/admin/backup/create", {
      type: "full"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(backup.status, 503);
    assert.match(backup.data.error, /cannot create and verify a restorable snapshot/i);

    const backups = await requestJson(app, "GET", "/api/admin/backup/list", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(backups.status, 200);
    assert.deepEqual(backups.data.backups, []);

    const restoreBackup = await requestJson(app, "POST", "/api/admin/backup/not-a-real-backup/restore", {}, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(restoreBackup.status, 503);
    assert.match(restoreBackup.data.error, /cannot validate or restore a snapshot/i);

    const maintenance = await requestJson(app, "POST", "/api/admin/maintenance/schedule", {
      startsAt: "2026-07-20T10:00:00.000Z",
      endsAt: "2026-07-20T11:00:00.000Z",
      note: "contract maintenance"
    }, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(maintenance.status, 200);

    const maintenanceWindows = await requestJson(app, "GET", "/api/admin/maintenance/windows", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(maintenanceWindows.status, 200);

    const restartService = await requestJson(app, "POST", "/api/admin/system/services/api/restart", {}, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(restartService.status, 503);
    assert.match(restartService.data.error, /no verified service-control integration/i);

    const alerts = await requestJson(app, "GET", "/api/admin/system/alerts", undefined, {
      Authorization: `Bearer ${refreshedAdminToken}`
    });
    assert.equal(alerts.status, 200);
    assert.ok(Array.isArray(alerts.data.alerts));

    if (alerts.data.alerts.length) {
      const acknowledgeAlert = await requestJson(app, "POST", `/api/admin/system/alerts/${alerts.data.alerts[0].id}/acknowledge`, {}, {
        Authorization: `Bearer ${refreshedAdminToken}`
      });
      assert.equal(acknowledgeAlert.status, 200);
    }

    const logout = await requestJson(app, "POST", "/api/auth/logout", {}, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(logout.status, 200);
    const profileAfterLogout = await requestJson(app, "GET", "/api/user/profile", undefined, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(profileAfterLogout.status, 401);
  assert.equal(fs.existsSync(filePath), true);
  const customStore = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.ok(Array.isArray(customStore.users));
  assert.ok(customStore.users.some((item) => item.email === customUserEmail));

  if (fs.existsSync(DEFAULT_RUNTIME_STORE_PATH)) {
    const runtimeStore = JSON.parse(fs.readFileSync(DEFAULT_RUNTIME_STORE_PATH, "utf8"));
    assert.ok(!runtimeStore.users.some((item) => item.email === customUserEmail));
  }

  fs.rmSync(storageDirectory, { force: true, recursive: true });

  const aliasApp = await createBackendApp({
    storagePath: storagePathAlias
  });

  const aliasRegister = await requestJson(aliasApp, "POST", "/api/auth/register", {
    email: "storage-alias@test.example",
    password: "alias-pass",
    name: "Storage Alias User"
  });
  assert.equal(aliasRegister.status, 201);

  assert.equal(fs.existsSync(storagePathAlias), true);
  const aliasStore = JSON.parse(fs.readFileSync(storagePathAlias, "utf8"));
  assert.ok(aliasStore.users.some((item) => item.email === "storage-alias@test.example"));
  fs.rmSync(storagePathAlias, { force: true });

  const precedenceApp = await createBackendApp({
    allowMissingEnv: false,
    filePath: precedencePath,
    storagePath: storagePathAlias
  });

  const precedenceRegister = await requestJson(precedenceApp, "POST", "/api/auth/register", {
    email: "precedence@test.example",
    password: "precedence-pass",
    name: "Precedence User"
  });
  assert.equal(precedenceRegister.status, 201);

  assert.equal(fs.existsSync(precedencePath), true);
  const precedenceStore = JSON.parse(fs.readFileSync(precedencePath, "utf8"));
  assert.ok(precedenceStore.users.some((item) => item.email === "precedence@test.example"));
  if (fs.existsSync(storagePathAlias)) {
    const aliasAfterPrecedence = JSON.parse(fs.readFileSync(storagePathAlias, "utf8"));
    assert.ok(!aliasAfterPrecedence.users.some((item) => item.email === "precedence@test.example"));
  }
  fs.rmSync(precedencePath, { force: true });
  fs.rmSync(storagePathAlias, { force: true });

  process.env.DATABASE_URL = "postgresql://not-an-active-backend.example/summarize-this";
  const databaseUrlApp = await createBackendApp({ filePath: databaseUrlPath });
  assert.ok(databaseUrlApp.store instanceof LocalBackendStore);
  assert.equal(fs.existsSync(databaseUrlPath), true);
  await assert.rejects(
    () => createBackendApp({ filePath: databaseUrlPath, storeType: "postgres" }),
    /Only the local JSON runtime store is implemented/
  );
  process.env.DATABASE_URL = "";
  fs.rmSync(databaseUrlPath, { force: true });

  console.log("Backend contract tests passed.");
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
