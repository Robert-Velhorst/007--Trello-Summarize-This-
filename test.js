const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const SummarizeThis = require("./summarizer-core");
const CardIntelligenceLedger = require("./card-intelligence-ledger");
const TrelloAdminConfig = require("./trello-admin-config");
const AttachmentProcessor = require("./attachment-processor");
const AIProviders = require("./ai-providers");
const TrelloIntegration = require("./trello-integration");
const CustomPromptManager = require("./custom-prompts");

[
  "README.md",
  "FINAL_DEPLOYMENT_GUIDE.md",
  "999_ACCURACY_IMPLEMENTATION.md"
].forEach((fileName) => {
  const documentText = fs.readFileSync(path.join(__dirname, fileName), "utf8");
  assert.doesNotMatch(documentText, /99\.9|Est\. Accuracy|Overall Accuracy|Accuracy: 99|accurate AI-powered|accuracy through/i);
  assert.match(documentText, /confidence/i);
});

[
  "docs/TECHNICAL_AUDIT.md",
  "docs/CRITICAL_PATH.md",
  "docs/ACCEPTANCE_TESTS.md",
  "docs/GOAL_COMPLETION_MATRIX.md",
  "docs/FINAL_VERIFICATION_REPORT.md",
  "docs/UI_ACTION_AUDIT.md",
  "docs/API_USAGE_AUDIT.md",
  "docs/SECURITY.md",
  "docs/OPERATOR_RUNBOOK.md",
  "docs/CODEX_WORKLOG.md",
  "docs/CODEX_CHECKPOINTS.md",
  "docs/TASK_GRAPH.md"
].forEach((fileName) => {
  assert.ok(fs.existsSync(path.join(__dirname, fileName)), `${fileName} exists`);
});

assert.ok(fs.existsSync(path.join(__dirname, "trello-config.js")), "trello-config.js exists");

const technicalAuditText = fs.readFileSync(path.join(__dirname, "docs/TECHNICAL_AUDIT.md"), "utf8");
assert.match(technicalAuditText, /static Power-Up flow/i);
assert.match(technicalAuditText, /database-user\.js/);
assert.match(technicalAuditText, /not part of the current shipped Power-Up claim/i);

const completionMatrixText = fs.readFileSync(path.join(__dirname, "docs/GOAL_COMPLETION_MATRIX.md"), "utf8");
assert.match(completionMatrixText, /\| PDF\/Word\/Excel\/image OCR extraction \| Partial \|/);
assert.match(completionMatrixText, /\| Trello description writeback \| Implemented \(local code; live verification pending\) \|/);

const trelloConfigText = fs.readFileSync(path.join(__dirname, "trello-config.js"), "utf8");
assert.match(trelloConfigText, /SummarizeThisTrelloConfig/);
assert.match(trelloConfigText, /appKey/);

function readPowerShellStringArray(fileName, variableName) {
  const scriptText = fs.readFileSync(path.join(__dirname, fileName), "utf8");
  const pattern = new RegExp("\\$" + variableName + "\\s*=\\s*@\\(([\\s\\S]*?)\\)", "m");
  const match = scriptText.match(pattern);
  assert.ok(match, `${variableName} array exists in ${fileName}`);
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

const installerBuildRuntimeFiles = readPowerShellStringArray("installer/windows/build-installer.ps1", "RuntimeFiles");
const installerInstallRuntimeFiles = readPowerShellStringArray("installer/windows/install.ps1", "RuntimeFiles");
installerBuildRuntimeFiles.forEach((fileName) => {
  assert.ok(
    installerInstallRuntimeFiles.includes(fileName),
    `Windows installer install.ps1 copies runtime file ${fileName}`
  );
});
["Start-SummarizeThis.ps1", "uninstall.ps1"].forEach((fileName) => {
  assert.ok(
    installerInstallRuntimeFiles.includes(fileName),
    `Windows installer install.ps1 copies helper script ${fileName}`
  );
});
assert.ok(installerBuildRuntimeFiles.includes("update.json"), "Windows installer bundles update manifest");
assert.ok(installerInstallRuntimeFiles.includes("update.json"), "Windows installer installs update manifest");
const launcherScriptText = fs.readFileSync(path.join(__dirname, "installer/windows/Start-SummarizeThis.ps1"), "utf8");
assert.match(launcherScriptText, /\[int\]\$Port\s*=\s*17117/, "Windows launcher supports an explicit QA port while preserving the installed default");
assert.match(launcherScriptText, /RepoRootCandidate/, "Windows launcher can resolve the repository root when run from installer/windows");
assert.match(launcherScriptText, /Join-Path \$RepoRootCandidate "popup\.html"/, "Windows launcher serves repo static files during local development");
const updateManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "update.json"), "utf8"));
assert.equal(updateManifest.schemaVersion, "summarize-this-update-manifest-v1");
assert.equal(updateManifest.version, SummarizeThis.APP_VERSION);
assert.match(updateManifest.manifestUrl, /^https:\/\/raw\.githubusercontent\.com\/Noodzakelijk-Online\/007--Trello-Summarize-This-\//);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
assert.equal(packageJson.main, "index.js");
assert.equal(packageJson.scripts.start, "node local-dev-server.js");
assert.equal(packageJson.scripts["start:backend"], "node backend-server.js");
assert.equal(packageJson.scripts.doctor, "node doctor.js");
assert.equal(packageJson.scripts["doctor:backend"], "node backend-doctor.js");
assert.equal(packageJson.scripts.test, "node test.js && node backend.test.js");
const indexEntryText = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
assert.doesNotMatch(indexEntryText, /Inherited file content will not be shown/);
assert.match(indexEntryText, /require\("\.\/local-dev-server"\)/);
const localServerText = fs.readFileSync(path.join(__dirname, "local-dev-server.js"), "utf8");
assert.match(localServerText, /path\.normalize/);
assert.match(localServerText, /path\.relative\(ROOT, resolved\)/);
assert.match(localServerText, /require\.main === module/);
assert.match(localServerText, /Open http:\/\/\$\{HOST\}:\$\{PORT\}\/connector\.html/);
const LocalDevServer = require("./local-dev-server");
assert.equal(LocalDevServer.safePathname("/%E0%A4%A"), null);
assert.equal(LocalDevServer.resolveFile("/connector.html"), path.join(__dirname, "connector.html"));
assert.equal(LocalDevServer.isPathInsideRoot(path.resolve(__dirname, "..", `${path.basename(__dirname)}-escape`, "secret.txt")), false);
const doctorText = fs.readFileSync(path.join(__dirname, "doctor.js"), "utf8");
assert.match(doctorText, /Doctor checks passed/);
assert.match(doctorText, /connector\.html/);
assert.match(doctorText, /backend-server\.js/);
const backendDoctorText = fs.readFileSync(path.join(__dirname, "backend-doctor.js"), "utf8");
assert.match(backendDoctorText, /Backend doctor checks passed/);
assert.match(backendDoctorText, /Trello app key presence/);
assert.ok(fs.existsSync(path.join(__dirname, "backend-server.js")));
assert.ok(fs.existsSync(path.join(__dirname, "backend-app.js")));
assert.ok(fs.existsSync(path.join(__dirname, "backend-config.js")));
assert.ok(fs.existsSync(path.join(__dirname, "backend-doctor.js")));
assert.ok(fs.existsSync(path.join(__dirname, "backend.test.js")));
assert.ok(fs.existsSync(path.join(__dirname, "database/connection.js")));
assert.ok(fs.existsSync(path.join(__dirname, "middleware/errorHandler.js")));
const backendServerText = fs.readFileSync(path.join(__dirname, "backend-server.js"), "utf8");
assert.match(backendServerText, /Missing required environment variables/);
const backendAppText = fs.readFileSync(path.join(__dirname, "backend-app.js"), "utf8");
assert.match(backendAppText, /\/api\/health/);
assert.match(backendAppText, /\/api\/readiness/);
assert.match(backendAppText, /\/api\/admin\/users/);
assert.match(backendAppText, /\/api\/admin\/settings/);
assert.match(backendAppText, /\/api\/admin\/system\/alerts/);
assert.match(backendAppText, /\/api\/admin\/reports/);
assert.match(backendAppText, /\/api\/admin\/backup\/create/);
assert.match(backendAppText, /\/api\/admin\/maintenance\/schedule/);
assert.match(backendAppText, /\/api\/admin\/credits\/bulk-adjust/);
const backendConfigText = fs.readFileSync(path.join(__dirname, "backend-config.js"), "utf8");
assert.match(backendConfigText, /function env\(\)/);
assert.match(backendConfigText, /get JWT_SECRET\(\)/);

const sample = SummarizeThis.sampleCardData();
const normalized = SummarizeThis.normalizeCardData(sample);

assert.equal(normalized.name, "Prepare launch checklist");
assert.equal(normalized.boardName, "Product Delivery");
assert.equal(normalized.checklistStats.total, 3);
assert.equal(normalized.checklistStats.complete, 1);
assert.equal(normalized.listContext.sampledCards, 4);
assert.equal(normalized.listContext.currentPosition, 2);
assert.ok(normalized.listContext.labelPatterns.some(item => item.label === "Launch" && item.count === 3));
assert.equal(normalized.listContext.sampledCardPreview.length, 4);
assert.equal(normalized.listContext.sampledCardPreview[1].id, "sample-card");
assert.equal(normalized.listContext.sampledCardPreview[1].url, "https://trello.com/c/samplecard/prepare-launch-checklist");
const normalizedUnsafeListUrl = SummarizeThis.normalizeCardData({
  name: "Unsafe list URL",
  listContext: {
    cards: [
      { name: "Unsafe card", url: "https://evil.example/c/unsafe" },
      { name: "Trello card", url: "https://trello.com/c/safe-card/path?token=secret#hash" }
    ]
  }
});
assert.equal(normalizedUnsafeListUrl.listContext.sampledCardPreview[0].url, "");
assert.equal(normalizedUnsafeListUrl.listContext.sampledCardPreview[1].url, "https://trello.com/c/safe-card/path");
assert.equal(normalized.customFields.length, 2);
assert.ok(normalized.customFields.some(item => item.name === "Priority" && item.value === "High"));
assert.equal(normalized.actions.length, 1);
assert.equal(normalized.actions[0].type, "updateCard");
assert.equal(normalized.attachments.length, 3);
assert.ok(normalized.attachments.some(item => item.name === "launch-plan.pdf" && item.category === "document"));
assert.ok(normalized.attachments.some(item => item.name === "kickoff-transcript.txt" && item.category === "transcript"));
assert.ok(normalized.attachments.some(item => item.name === "demo-recording.mp4" && item.category === "recording"));
const sensitiveSignals = SummarizeThis.detectSensitiveSignals(sample);
assert.equal(sensitiveSignals.requiresAiApproval, true);
assert.ok(sensitiveSignals.categories.includes("client"));
assert.ok(sensitiveSignals.categories.includes("financial"));
assert.equal(SummarizeThis.shouldSkipSensitiveAttachmentTextExtraction(sample, {
  extractTextAttachments: true,
  requireSensitiveAiApproval: true
}, false), true);
assert.equal(SummarizeThis.shouldSkipSensitiveAttachmentTextExtraction(sample, {
  extractTextAttachments: true,
  requireSensitiveAiApproval: true
}, true), false);
assert.equal(SummarizeThis.shouldSkipSensitiveAttachmentTextExtraction(sample, {
  extractTextAttachments: false,
  requireSensitiveAiApproval: true
}, false), false);
assert.equal(SummarizeThis.shouldSkipSensitiveAttachmentTextExtraction(sample, {
  extractTextAttachments: true,
  requireSensitiveAiApproval: false
}, false), false);
assert.equal(SummarizeThis.shouldSkipSensitiveAttachmentTextExtraction({
  name: "Public launch notes",
  desc: "Publish the final checklist.",
  attachments: [{ name: "notes.txt", mimeType: "text/plain" }]
}, {
  extractTextAttachments: true,
  requireSensitiveAiApproval: true
}, false), false);

const unsafeError = new Error("Authorization: Bearer sk-test-secret-token api_key=secret123 token=trello-token https://attachments.example.com/private.txt");
const providerSanitizer = new AIProviders();
const providerSafeError = providerSanitizer.sanitizeErrorMessage(unsafeError);
assert.doesNotMatch(providerSafeError, /sk-test-secret-token|secret123|trello-token/);
assert.match(providerSafeError, /redacted/);
const legacyOperationalPrompt = providerSanitizer.buildOperationalPrompt({
  name: "Approve VA follow-up",
  desc: "Robert needs to decide whether the VA may send the client update.",
  labels: [{ name: "Client" }],
  members: [{ fullName: "Robert" }],
  due: "2026-07-05T00:00:00.000Z",
  checklistProgress: "1 of 3 items completed",
  comments: [
    {
      text: "Waiting on Robert approval before sending.",
      date: "2026-06-29T10:00:00.000Z",
      memberCreator: { fullName: "VA Team" }
    }
  ],
  attachments: [
    {
      name: "invoice.pdf",
      mimeType: "application/pdf",
      extractionStatus: "metadata-only"
    }
  ],
  __sourceStatus: {
    comments: { ok: true },
    attachments: { ok: true, detail: "Metadata only." }
  },
  __sourceCounts: {
    comments: 1,
    attachments: 1
  }
});
assert.ok(legacyOperationalPrompt.includes("robertDecisions"));
assert.ok(legacyOperationalPrompt.includes("vaReadyActions"));
assert.ok(legacyOperationalPrompt.includes("evidenceClaims"));
assert.ok(legacyOperationalPrompt.includes("validationFindings"));
assert.ok(legacyOperationalPrompt.includes("metadata-only"));
assert.ok(legacyOperationalPrompt.includes("VA Team"));
assert.doesNotMatch(legacyOperationalPrompt, /\[object Object\]/);
const parsedProviderJson = providerSanitizer.parseProviderJson("```json\n{\"about\":\"Card\",\"blockers\":[\"Waiting on Robert\"],\"robertDecisions\":[\"Approve? Yes/No\"],\"vaReadyActions\":[\"Draft update\"]}\n```");
assert.deepEqual(parsedProviderJson.blockers, ["Waiting on Robert"]);
assert.deepEqual(parsedProviderJson.robertDecisions, ["Approve? Yes/No"]);
const trelloSanitizer = new TrelloIntegration();
const trelloSafeError = trelloSanitizer.sanitizeErrorMessage(unsafeError);
assert.doesNotMatch(trelloSafeError, /secret123|trello-token|attachments\.example\.com/);
assert.match(trelloSafeError, /redacted|url redacted/);
const popupText = fs.readFileSync(path.join(__dirname, "popup.html"), "utf8");
assert.match(popupText, /trello-config\.js/);
assert.match(popupText, /function trelloAppKey/);
assert.doesNotMatch(popupText, /var TRELLO_API_KEY = "87f50d5376d860dfac3dfbb42f5c7e79"/);
assert.match(popupText, /color-scheme:\s*light dark/);
assert.match(popupText, /prefers-color-scheme:\s*dark/);
assert.match(popupText, /function sanitizeUserVisibleError/);
assert.match(popupText, /Provider message: " \+ sanitizeUserVisibleError\(error\)/);
assert.match(popupText, /Could not confirm the Trello comment outcome: " \+ sanitizeUserVisibleError\(error\)/);
assert.match(popupText, /function trelloCommentAttemptKey/);
assert.match(popupText, /summarizeThisTrelloCommentAttempts/);
assert.match(popupText, /saveTrelloCommentAttempt\(lastCardData\.id, text, "pending"\)/);
assert.match(popupText, /saveTrelloCommentAttempt\(lastCardData\.id, text, "posted"\)/);
assert.match(popupText, /saveTrelloCommentAttempt\(lastCardData\.id, text, "ambiguous"\)/);
assert.match(popupText, /Check the Trello card manually before posting again/);
assert.match(popupText, /createTrelloDescriptionDraft/);
assert.match(popupText, /summarizeThisTrelloDescriptionAttempts/);
assert.match(popupText, /Checking the current Trello description before updating/);
assert.match(popupText, /fields=desc/);
assert.match(popupText, /method: "PUT"/);
assert.match(popupText, /The Trello description changed since this analysis/);
assert.match(popupText, /Could not confirm the Trello description outcome/);
assert.match(popupText, /built-in summarizer/);
assert.match(popupText, /metadata-only until approval/);
assert.match(popupText, /Trello app key is not configured for comment lookup/);
assert.match(popupText, /function maxOutputTokensFor/);
assert.match(popupText, /maxOutputTokens: maxOutputTokensFor\(settings\)/);
assert.match(popupText, /max_tokens: maxOutputTokens/);
assert.match(popupText, /timingTracker: timingTracker/);
assert.match(popupText, /recordStage\("local-summary", "Local summary", localSummaryStartedAt, nowMs\(\)\)/);
assert.match(popupText, /recordStage\("ai-provider", "AI provider", providerStartedAt, nowMs\(\)\)/);
assert.doesNotMatch(popupText, /timingTracker\.mark\("local-summary", "Local summary"\)/);
assert.doesNotMatch(popupText, /timingTracker\.mark\("ai-provider", "AI provider"\)/);
assert.match(popupText, /buildRuleBasedAnalysis\(cardData,\s*\{\s*outputLanguage: settings\.outputLanguage\s*\}\)/);
assert.match(popupText, /id="updatePanel"/);
assert.match(popupText, /id="checkUpdatesButton"/);
assert.match(popupText, /function checkForUpdates/);
assert.match(popupText, /credentials:\s*"omit"/);
assert.match(popupText, /referrerPolicy:\s*"no-referrer"/);
assert.doesNotMatch(popupText, /DOMContentLoaded[\s\S]{0,200}checkForUpdates\(/);
assert.match(popupText, /id="batchExecutionControls"/);
assert.match(popupText, /id="batchAiHandoffApproval"/);
assert.match(popupText, /id="previewBatchExecutionButton"/);
assert.match(popupText, /id="runBatchExecutionButton"/);
assert.match(popupText, /id="openFirstBatchCardButton"/);
assert.match(popupText, /id="copyBatchManualChecklistButton"/);
assert.match(popupText, /id="copyBatchHandoffReportButton"/);
assert.match(popupText, /id="resetBatchProgressButton"/);
assert.match(popupText, /id="batchProgressSummary"/);
assert.match(popupText, /id="batchProgressList"/);
assert.match(popupText, /id="batchManualChecklistFallback"/);
assert.match(popupText, /id="copyDecisionPacketButton"/);
assert.match(popupText, /id="exportManualCopyFallback"/);
assert.match(popupText, /id="aiClaimBoundaryPanel"/);
assert.match(popupText, /id="aiFactsList"/);
assert.match(popupText, /id="aiInferencesList"/);
assert.match(popupText, /id="aiUncertaintyList"/);
assert.match(popupText, /id="aiUnsupportedClaimsList"/);
assert.match(popupText, /function renderAiClaimBoundary/);
assert.match(popupText, /AI-provided statements are shown separately from the card evidence above/);
assert.match(popupText, /function renderBatchExecutionReview/);
assert.match(popupText, /function openFirstBatchCard/);
assert.match(popupText, /function copyBatchManualChecklist/);
assert.match(popupText, /function copyBatchHandoffReport/);
assert.match(popupText, /copyLedgerExport\("decision-handoff-packet"\)/);
assert.match(popupText, /decisionHandoffPacketForLedgerRun/);
assert.match(popupText, /function renderBatchProgress/);
assert.match(popupText, /function updateBatchProgressFromControl/);
assert.match(popupText, /Batch progress saved privately/);
assert.match(popupText, /var finalBatchStatus = blockedCount \? "needs-attention" : "review-required"/);
assert.match(popupText, /card\(s\) analyzed and require human review/);
assert.match(popupText, /no Trello card was changed/);
assert.doesNotMatch(popupText, /Selected cards were analyzed, stored privately/);
assert.match(popupText, /approved .* export is shown below for manual copy/);
assert.match(popupText, /approved batch handoff report is shown below/);
assert.match(popupText, /approved manual batch checklist is shown below/);
assert.match(popupText, /createBatchExecutionReview\(plan/);
assert.match(popupText, /Automatic execution:/);
assert.doesNotMatch(popupText, /startBatch\(/);
assert.match(popupText, /function defaultCopyFormatFor/);
assert.match(popupText, /function updateQuickCopyButton/);
assert.match(popupText, /id="copyChangeBriefButton"/);
assert.match(popupText, /copyLedgerExport\("change-brief"\)/);
assert.match(popupText, /function analysisCacheProfile/);
assert.match(popupText, /function findReusableLedgerRun/);
assert.match(popupText, /function aiConnectorSignature/);
assert.match(popupText, /directProviders: directProviders/);
assert.match(popupText, /selectedProviderHasKey/);
assert.doesNotMatch(popupText, /apiKeyHash|compactHash\(keys\[provider\]\)|apiKeys:\s*(settings\.apiKeys|keys)/);
assert.match(popupText, /forceRefresh: true/);
assert.match(popupText, /async function runConsensusAI/);
assert.match(popupText, /consensusProviderCount/);
assert.match(popupText, /Consensus mode was requested/);
assert.match(popupText, /preferredFormat === "trello-comment-draft"/);
assert.match(popupText, /Review the exact draft and tick the approval box before copying or posting it/);
assert.doesNotMatch(popupText, /error:\s*error\.message \|\| String\(error\)/);
assert.doesNotMatch(popupText, /showError\(error\.message \|\| String\(error\)\)/);
const settingsText = fs.readFileSync(path.join(__dirname, "settings-powerup.html"), "utf8");
assert.match(settingsText, /color-scheme:\s*light dark/);
assert.match(settingsText, /prefers-color-scheme:\s*dark/);
assert.match(settingsText, /id="maxOutputTokens"/);
assert.match(settingsText, /id="defaultCopyFormat"/);
assert.match(settingsText, /value="change-brief"/);
assert.match(settingsText, /id="providerMode"/);
assert.match(settingsText, /normalizeGenerationSettings/);
assert.match(settingsText, /normalizeExportPreferences/);
assert.match(settingsText, /normalizeProviderMode/);
const attachmentSanitizer = new AttachmentProcessor();
const attachmentSafeError = attachmentSanitizer.sanitizeErrorMessage(unsafeError);
assert.doesNotMatch(attachmentSafeError, /secret123|trello-token|attachments\.example\.com/);
assert.match(attachmentSafeError, /redacted|url redacted/);
const previousLocalStorage = global.localStorage;
global.localStorage = {
  getItem() {
    return null;
  },
  setItem() {}
};
const promptManager = new CustomPromptManager();
global.localStorage = previousLocalStorage;
const promptPayload = promptManager.formatPrompt("default", {
  name: "Release checklist",
  board: "Product Board",
  list: "Review",
  labels: ["High", "Sprint"],
  members: [{ fullName: "Alice" }, "Bob"],
  due: "2026-07-02T00:00:00Z",
  dueComplete: true,
  checklistProgress: "1/2 completed",
  checklists: [
    {
      name: "Release Tasks",
      checkItems: [
        { name: "Build", state: "complete" },
        { name: "Deploy", state: "incomplete" }
      ]
    }
  ],
  comments: [
    {
      memberCreator: { fullName: "Alice" },
      date: "2026-06-29T00:00:00Z",
      text: "Kickoff notes."
    },
    {
      memberCreator: "Bob",
      date: "invalid-date",
      text: "Manual follow-up required."
    }
  ],
  attachments: [
    { name: "design.txt", mimeType: "text/plain" }
  ]
});
assert.ok(promptPayload.user.includes("CARD: Release checklist"));
assert.ok(promptPayload.user.includes("BOARD: Product Board"));
assert.ok(promptPayload.user.includes("LIST: Review"));
assert.ok(promptPayload.user.includes("LABELS: High, Sprint"));
assert.ok(promptPayload.user.includes("MEMBERS: Alice, Bob"));
assert.ok(promptPayload.user.includes("DUE DATE:"));
assert.ok(promptPayload.user.includes("STATUS: Completed"));
assert.ok(promptPayload.user.includes("- design.txt (text/plain)"));
assert.ok(promptPayload.user.includes("COMMENTS:"));
assert.ok(promptPayload.user.includes("Alice"));
assert.ok(promptPayload.user.includes("Unknown date"));
const localPreviewSettings = SummarizeThis.stripApiKeysForLocalPreview({
  analysisMode: "auto",
  provider: "openai",
  apiKeys: {
    openai: "sk-local-preview-secret",
    google: "google-local-preview-secret"
  },
  proxy: {
    enabled: true,
    endpoint: "https://proxy.example.com/summarize"
  },
  promptContext: {
    commentLimit: 12
  }
});
assert.deepEqual(localPreviewSettings.apiKeys, {});
assert.equal(localPreviewSettings.analysisMode, "auto");
assert.equal(localPreviewSettings.proxy.endpoint, "https://proxy.example.com/summarize");
assert.equal(localPreviewSettings.promptContext.commentLimit, 12);

const proxySettings = SummarizeThis.normalizeProxySettings({
  enabled: true,
  endpoint: "https://proxy.example.com/summarize?token=secret#debug"
});
assert.equal(proxySettings.enabled, true);
assert.equal(proxySettings.endpoint, "https://proxy.example.com/summarize");
assert.equal(proxySettings.valid, true);

const localProxySettings = SummarizeThis.normalizeProxySettings({
  enabled: true,
  endpoint: "http://127.0.0.1:8787/ai"
});
assert.equal(localProxySettings.enabled, true);
assert.equal(localProxySettings.endpoint, "http://127.0.0.1:8787/ai");

const unsafeProxySettings = SummarizeThis.normalizeProxySettings({
  enabled: true,
  endpoint: "https://user:password@proxy.example.com/ai"
});
assert.equal(unsafeProxySettings.enabled, false);
assert.equal(unsafeProxySettings.valid, false);
assert.match(unsafeProxySettings.error, /public HTTPS proxy endpoint/);

const disabledProxySettings = SummarizeThis.normalizeProxySettings({
  enabled: false,
  endpoint: "https://proxy.example.com/ai"
});
assert.equal(disabledProxySettings.enabled, false);
assert.equal(disabledProxySettings.endpoint, "https://proxy.example.com/ai");

const explicitBackendSettings = SummarizeThis.normalizeBackendSettings({
  apiBase: "https://powerup.example.com/api/"
});
assert.equal(explicitBackendSettings.apiBase, "https://powerup.example.com/api");
assert.equal(explicitBackendSettings.valid, true);
assert.equal(explicitBackendSettings.derivedFromProxy, false);

const derivedBackendSettings = SummarizeThis.normalizeBackendSettings({}, {
  enabled: true,
  endpoint: "https://proxy.example.com/summarize-this/ai"
});
assert.equal(derivedBackendSettings.apiBase, "https://proxy.example.com/api");
assert.equal(derivedBackendSettings.valid, true);
assert.equal(derivedBackendSettings.derivedFromProxy, true);

const defaultGenerationSettings = SummarizeThis.normalizeGenerationSettings();
assert.equal(defaultGenerationSettings.maxOutputTokens, 900);
assert.equal(SummarizeThis.normalizeGenerationSettings({ maxOutputTokens: "1200" }).maxOutputTokens, 1200);
assert.equal(SummarizeThis.normalizeGenerationSettings({ maxOutputTokens: "99999" }).maxOutputTokens, 2000);
assert.equal(SummarizeThis.normalizeGenerationSettings({ maxTokens: "250" }).maxOutputTokens, 300);
assert.equal(SummarizeThis.normalizeProviderMode(), "fallback");
assert.equal(SummarizeThis.normalizeProviderMode("consensus"), "consensus");
assert.equal(SummarizeThis.normalizeProviderMode("parallel-everything"), "fallback");
assert.equal(SummarizeThis.compareVersions("1.2.0", "1.1.9"), 1);
assert.equal(SummarizeThis.compareVersions("v1.0.0", "1"), 0);
assert.equal(SummarizeThis.compareVersions("1.0.0", "1.0.1"), -1);
const normalizedUpdateManifest = SummarizeThis.normalizeUpdateManifest({
  version: "1.2.3",
  releaseNotesUrl: "https://github.com/Noodzakelijk-Online/007--Trello-Summarize-This-/releases/tag/v1.2.3",
  downloadUrl: "https://evil.example/download.exe",
  manifestUrl: "https://raw.githubusercontent.com/Noodzakelijk-Online/007--Trello-Summarize-This-/main/update.json",
  message: "Update available."
});
assert.equal(normalizedUpdateManifest.version, "1.2.3");
assert.equal(normalizedUpdateManifest.downloadUrl, "");
assert.match(normalizedUpdateManifest.releaseNotesUrl, /github\.com\/Noodzakelijk-Online/);
const availableUpdate = SummarizeThis.evaluateUpdateStatus("1.0.0", normalizedUpdateManifest);
assert.equal(availableUpdate.updateAvailable, true);
assert.equal(availableUpdate.upToDate, false);
assert.equal(SummarizeThis.evaluateUpdateStatus("1.2.3", normalizedUpdateManifest).upToDate, true);
assert.equal(SummarizeThis.normalizeExportPreferences().defaultCopyFormat, "markdown");
assert.equal(SummarizeThis.normalizeExportPreferences({ defaultCopyFormat: "va-handoff-brief" }).defaultCopyFormat, "va-handoff-brief");
assert.equal(SummarizeThis.normalizeExportPreferences({ defaultCopyFormat: "change-brief" }).defaultCopyFormat, "change-brief");
assert.equal(SummarizeThis.normalizeExportPreferences({ defaultExportFormat: "trello-comment-draft" }).defaultCopyFormat, "trello-comment-draft");
assert.equal(SummarizeThis.normalizeExportPreferences({ defaultCopyFormat: "edit-card-description" }).defaultCopyFormat, "markdown");

const local = SummarizeThis.buildRuleBasedAnalysis(sample, {
  now: new Date()
});

assert.equal(local.metadata.provider, "Local rules");
assert.ok(local.summary.about.includes("Prepare launch checklist"));
assert.ok(Array.isArray(local.summary.nextSteps));
assert.ok(local.summary.nextSteps.length >= 1);
assert.ok(local.qualityScore >= 60);
assert.ok(local.summary.insights.some(item => item.includes("List context includes")));
assert.ok(local.summary.insights.some(item => item.includes("Custom fields included")));
assert.ok(local.summary.history.includes("recent activity"));
assert.ok(local.summary.insights.some(item => item.includes("Recent activity included")));
assert.ok(local.summary.insights.some(item => item.includes("Attachment metadata includes")));
assert.ok(local.summary.risks.some(item => item.includes("Attachment contents were not verified")));

const dutchLocal = SummarizeThis.buildRuleBasedAnalysis(sample, {
  outputLanguage: "nl",
  now: new Date(Date.now() + 4 * 86400000)
});
assert.ok(dutchLocal.summary.about.includes("Deze kaart"));
assert.ok(dutchLocal.summary.history.includes("opmerking"));
assert.ok(dutchLocal.summary.history.includes("meegenomen"));
assert.ok(dutchLocal.summary.status.includes("Huidige lijst"));
assert.ok(dutchLocal.summary.status.includes("Deze kaart"));
assert.ok(dutchLocal.summary.insights.some(item => item.includes("Checklistvoortgang")));
assert.ok(dutchLocal.summary.insights.some(item => item.includes("bijlagen kunnen ondersteunende details bevatten")));
assert.ok(dutchLocal.summary.risks.some(item => item.includes("Bijlage-inhoud is niet geverifieerd")));
assert.ok(dutchLocal.summary.recommendations.some(item => item.includes("Gebruik de volgende stappen")));
assert.equal(dutchLocal.metadata.outputLanguage, "nl");

const staleLocal = SummarizeThis.buildRuleBasedAnalysis(Object.assign({}, sample, {
  dateLastActivity: "2026-05-20T12:00:00.000Z",
  comments: [],
  actions: []
}), {
  now: new Date("2026-06-30T12:00:00.000Z")
});
assert.ok(staleLocal.summary.history.includes("No visible card activity has been recorded for 41 days."));
assert.ok(staleLocal.summary.risks.some(item => item.includes("41 days")));
assert.ok(staleLocal.summary.recommendations.some(item => item.includes("current status comment")));

const prompt = SummarizeThis.buildAIPrompt(sample);
assert.ok(prompt.includes("Return only valid JSON"));
assert.ok(prompt.includes("robertDecisions"));
assert.ok(prompt.includes("vaReadyActions"));
assert.ok(prompt.includes("unresolvedQuestions"));
assert.ok(prompt.includes("waitingOn"));
assert.ok(prompt.includes("unclearPoints"));
assert.ok(prompt.includes("evidenceClaims"));
assert.ok(prompt.includes("Prepare launch checklist"));
assert.equal(SummarizeThis.normalizeOutputMode("risk-review"), "risk-review");
assert.equal(SummarizeThis.normalizeOutputMode("unknown-mode"), "operational-ledger");
assert.equal(SummarizeThis.getOutputModeLabel("meeting-brief"), "Meeting brief");
assert.equal(SummarizeThis.normalizeOutputLanguage("dutch"), "nl");
assert.equal(SummarizeThis.normalizeOutputLanguage("unknown-language"), "en");
assert.equal(SummarizeThis.getOutputLanguageLabel("nl"), "Dutch");

const listPlanningCard = Object.assign({}, sample, {
  listContext: Object.assign({}, sample.listContext, {
    cards: sample.listContext.cards.map(card => card.id === "sample-card"
      ? Object.assign({}, card, { due: sample.due, dueComplete: false })
      : card.id === "sample-next"
        ? Object.assign({}, card, {
          name: "Waiting on client approval",
          desc: "This neighboring description must stay out of list planning exports.",
          due: new Date(Date.now() + 2 * 86400000).toISOString(),
          dueComplete: false
        })
      : card)
  })
});
const listTrendSignals = SummarizeThis.createListTrendSignals(listPlanningCard, {
  now: new Date(Date.now() + 4 * 86400000).toISOString()
});
assert.equal(listTrendSignals.schemaVersion, "summarize-this-list-trend-signals-v1");
assert.equal(listTrendSignals.sampledCards, 4);
assert.ok(listTrendSignals.signals.some(item => item.id === "overdue-pressure"));
assert.ok(listTrendSignals.signals.some(item => item.id === "label-concentration"));
assert.ok(listTrendSignals.signals.some(item => item.id === "waiting-title-signals"));
assert.ok(listTrendSignals.privacyNote.includes("bounded list metadata"));

const listPlanningBrief = SummarizeThis.createListPlanningBrief(listPlanningCard, {
  now: new Date(Date.now() + 4 * 86400000).toISOString()
});
assert.equal(listPlanningBrief.schemaVersion, "summarize-this-list-planning-brief-v1");
assert.equal(listPlanningBrief.sampledCards, 4);
assert.equal(listPlanningBrief.currentPosition, 2);
assert.ok(listPlanningBrief.labelPatterns.some(item => item.label === "Launch"));
assert.ok(listPlanningBrief.dueCards.some(item => item.name === "Prepare launch checklist"));
assert.ok(listPlanningBrief.nextFocus.some(item => item.includes("Current card position")));
assert.ok(listPlanningBrief.trendSignals.signals.some(item => item.id === "waiting-title-signals"));
assert.ok(listPlanningBrief.privacyNote.includes("bounded list metadata"));

const listPlanningMarkdown = SummarizeThis.markdownForListPlanningBrief(listPlanningBrief);
assert.ok(listPlanningMarkdown.includes("List planning brief"));
assert.ok(listPlanningMarkdown.includes("Nearby cards"));
assert.ok(listPlanningMarkdown.includes("List trend signals"));
assert.ok(listPlanningMarkdown.includes("Privacy:"));
assert.equal(listPlanningMarkdown.includes("Finalize the launch checklist"), false);
assert.equal(listPlanningMarkdown.includes("neighboring description"), false);

const batchAnalysisPlan = SummarizeThis.createBatchAnalysisPlan(listPlanningCard, {
  now: new Date(Date.now() + 4 * 86400000).toISOString()
});
assert.equal(batchAnalysisPlan.schemaVersion, "summarize-this-batch-analysis-plan-v1");
assert.equal(batchAnalysisPlan.queueSize, 4);
assert.equal(batchAnalysisPlan.approvalRequired, true);
assert.equal(batchAnalysisPlan.aiHandoffDefault, "off");
assert.equal(batchAnalysisPlan.recommendedConcurrency, 1);
assert.ok(batchAnalysisPlan.queue.some(item => item.cardId === "sample-card" && item.signals.includes("current-card")));
assert.ok(batchAnalysisPlan.queue.some(item => item.name === "Prepare launch checklist" && item.signals.includes("overdue")));
assert.ok(batchAnalysisPlan.queue.some(item => item.cardId === "sample-card" && item.cardUrl === "https://trello.com/c/samplecard/prepare-launch-checklist"));
assert.ok(batchAnalysisPlan.approvalChecklist.some(item => item.includes("Approve AI handoff")));
assert.ok(batchAnalysisPlan.privacyNote.includes("bounded list metadata"));

const batchPlanMarkdown = SummarizeThis.markdownForBatchAnalysisPlan(batchAnalysisPlan);
assert.ok(batchPlanMarkdown.includes("Batch analysis plan"));
assert.ok(batchPlanMarkdown.includes("AI handoff default: off"));
assert.ok(batchPlanMarkdown.includes("Approval checklist"));
assert.equal(batchPlanMarkdown.includes("Finalize the launch checklist"), false);

const blockedBatchExecutionReview = SummarizeThis.createBatchExecutionReview(batchAnalysisPlan, {
  maxCards: 3,
  concurrency: 2,
  delaySeconds: 5,
  aiHandoffApproved: false
});
assert.equal(blockedBatchExecutionReview.schemaVersion, "summarize-this-batch-execution-review-v1");
assert.equal(blockedBatchExecutionReview.selectedCards, 3);
assert.equal(blockedBatchExecutionReview.concurrency, 2);
assert.equal(blockedBatchExecutionReview.delaySeconds, 5);
assert.equal(blockedBatchExecutionReview.automaticExecution, false);
assert.equal(blockedBatchExecutionReview.networkAction, "none");
assert.equal(blockedBatchExecutionReview.openableCards, 3);
assert.equal(blockedBatchExecutionReview.executionAllowed, false);
assert.ok(blockedBatchExecutionReview.blockedReasons.some(item => item.includes("AI handoff approval")));
assert.ok(blockedBatchExecutionReview.queue.every(item => item.status === "review-required"));
assert.ok(blockedBatchExecutionReview.privacyNote.includes("starts from bounded list metadata"));

const approvedBatchExecutionReview = SummarizeThis.createBatchExecutionReview(batchAnalysisPlan, {
  maxCards: 50,
  concurrency: 9,
  delaySeconds: 99,
  aiHandoffApproved: true
});
assert.equal(approvedBatchExecutionReview.selectedCards, 4);
assert.equal(approvedBatchExecutionReview.concurrency, 3);
assert.equal(approvedBatchExecutionReview.delaySeconds, 30);
assert.equal(approvedBatchExecutionReview.executionAllowed, true);
assert.equal(approvedBatchExecutionReview.trelloWriteDefault, "off");
assert.equal(approvedBatchExecutionReview.automaticExecution, true);
assert.equal(approvedBatchExecutionReview.networkAction, "trello-read-and-analyze");
assert.ok(approvedBatchExecutionReview.queue.every(item => item.status === "ready-for-reviewed-run"));
assert.ok(approvedBatchExecutionReview.queue.every(item => item.manualStep.includes("Run the reviewed batch here")));

const manualBatchChecklist = SummarizeThis.markdownForBatchManualRunChecklist(approvedBatchExecutionReview);
assert.ok(manualBatchChecklist.includes("Manual batch run checklist"));
assert.ok(manualBatchChecklist.includes("Automatic execution: on"));
assert.ok(manualBatchChecklist.includes("[2. Prepare launch checklist](https://trello.com/c/samplecard/prepare-launch-checklist)"));
assert.equal(manualBatchChecklist.includes("Finalize the launch checklist"), false);

const emptyBatchProgress = SummarizeThis.createBatchProgressSnapshot(approvedBatchExecutionReview, {});
assert.equal(emptyBatchProgress.schemaVersion, "summarize-this-batch-progress-v1");
assert.equal(emptyBatchProgress.totalCards, 4);
assert.equal(emptyBatchProgress.counts.pending, 4);
assert.equal(emptyBatchProgress.doneCards, 0);
assert.ok(emptyBatchProgress.queue[1].key.includes("https://trello.com/c/samplecard/prepare-launch-checklist"));
const trackedBatchProgress = SummarizeThis.createBatchProgressSnapshot(approvedBatchExecutionReview, {
  "url:https://trello.com/c/sampleprior/confirm-analytics-baseline": "opened",
  "url:https://trello.com/c/samplecard/prepare-launch-checklist": "analyzed",
  "url:https://trello.com/c/samplenext/draft-support-handoff": "copied",
  "url:https://trello.com/c/samplelater/review-billing-test-run": "invalid"
});
assert.equal(trackedBatchProgress.counts.opened, 1);
assert.equal(trackedBatchProgress.counts.analyzed, 1);
assert.equal(trackedBatchProgress.counts.copied, 1);
assert.equal(trackedBatchProgress.counts.pending, 1);
assert.equal(trackedBatchProgress.doneCards, 2);
assert.equal(trackedBatchProgress.needsAttentionCards, 2);
assert.ok(trackedBatchProgress.summary.includes("2 of 4 card(s) done"));

const batchHandoffReport = SummarizeThis.markdownForBatchHandoffReport(approvedBatchExecutionReview, trackedBatchProgress);
assert.ok(batchHandoffReport.includes("Batch handoff report"));
assert.ok(batchHandoffReport.includes("Progress: 2 of 4 card(s) done; 2 need attention."));
assert.ok(batchHandoffReport.includes("[2. Prepare launch checklist](https://trello.com/c/samplecard/prepare-launch-checklist): analyzed"));
assert.ok(batchHandoffReport.includes("Trello write default: off"));
assert.ok(batchHandoffReport.includes("Card links are limited to sanitized Trello card URLs."));
assert.equal(batchHandoffReport.includes("Finalize the launch checklist"), false);

const riskPromptPayload = parsePromptPayload(SummarizeThis.buildAIPrompt(sample, {
  outputMode: "risk-review",
  outputLanguage: "nl",
  customInstructions: "Prefer Yes/No decisions for Robert and keep VA-ready work separate."
}));
assert.equal(riskPromptPayload.outputMode.key, "risk-review");
assert.ok(riskPromptPayload.outputMode.instruction.includes("risks"));
assert.equal(riskPromptPayload.outputLanguage.key, "nl");
assert.equal(riskPromptPayload.outputLanguage.label, "Dutch");
assert.ok(riskPromptPayload.outputLanguage.instruction.includes("Dutch"));
assert.equal(riskPromptPayload.customInstructions, "Prefer Yes/No decisions for Robert and keep VA-ready work separate.");
assert.equal(riskPromptPayload.listContext.sampledCards, 4);
assert.equal(Boolean(riskPromptPayload.listContext.sampledCardPreview[0].url), false);
assert.equal(JSON.stringify(riskPromptPayload.listContext).includes("https://trello.com/c/"), false);
assert.equal(riskPromptPayload.contextIncluded.listContextCards, 4);
assert.equal(riskPromptPayload.customFields.length, 2);
assert.equal(riskPromptPayload.contextIncluded.customFieldsIncluded, 2);
assert.equal(riskPromptPayload.activity.length, 1);
assert.equal(riskPromptPayload.contextIncluded.activityItemsIncluded, 1);
assert.equal(riskPromptPayload.attachments.length, 3);
assert.equal(riskPromptPayload.contextIncluded.attachmentsIncluded, 3);
assert.ok(riskPromptPayload.attachments.some(item => item.category === "recording" && !item.extractedTextAvailable));
assert.equal(riskPromptPayload.sensitiveSignals.requiresAiApproval, true);
assert.equal(SummarizeThis.normalizeCustomInstructions(" guidance ".repeat(100)).length, 600);

const promptTemplateSettings = SummarizeThis.normalizePromptTemplateSettings({
  selectedPromptTemplateId: "robert-approval",
  promptTemplates: [{
    id: "robert approval!",
    name: "Robert approval review",
    instructions: "Frame Robert decisions as Yes/No and separate VA-ready work.",
    createdAt: "2026-06-29T13:00:00.000Z"
  }, {
    id: "empty",
    name: "Empty",
    instructions: ""
  }]
});
assert.equal(promptTemplateSettings.promptTemplates.length, 1);
assert.equal(promptTemplateSettings.promptTemplates[0].id, "robert-approval");
assert.equal(promptTemplateSettings.selectedPromptTemplateId, "robert-approval");

const selectedPromptTemplateSettings = SummarizeThis.normalizePromptTemplateSettings({
  selectedPromptTemplateId: "robert-approval",
  promptTemplates: [{
    id: "robert-approval",
    name: "Robert approval review",
    instructions: "Frame Robert decisions as Yes/No and separate VA-ready work."
  }]
});
assert.equal(selectedPromptTemplateSettings.selectedPromptTemplateName, "Robert approval review");
assert.ok(selectedPromptTemplateSettings.customInstructions.includes("Yes/No"));

const templatePromptPayload = parsePromptPayload(SummarizeThis.buildAIPrompt(sample, {
  selectedPromptTemplateId: "robert-approval",
  promptTemplates: selectedPromptTemplateSettings.promptTemplates
}));
assert.equal(templatePromptPayload.promptTemplate.id, "robert-approval");
assert.equal(templatePromptPayload.promptTemplate.name, "Robert approval review");
assert.ok(templatePromptPayload.customInstructions.includes("separate VA-ready work"));
assert.equal(JSON.stringify(templatePromptPayload).includes("promptTemplates"), false);

const cardWithPriorFeedback = Object.assign({}, sample, {
  priorFeedback: [{
    rating: "wrong",
    correctionText: "The invoice amount is still missing; do not say billing is complete.",
    incorrectSections: ["evidence-validation", "unresolved-questions"],
    createdAt: "2026-06-29T12:04:00.000Z"
  }]
});
const feedbackPrompt = SummarizeThis.buildAIPrompt(cardWithPriorFeedback);
const feedbackPromptPayload = parsePromptPayload(feedbackPrompt);
assert.equal(feedbackPromptPayload.priorFeedback.length, 1);
assert.ok(feedbackPromptPayload.priorFeedback[0].correctionText.includes("invoice amount"));
assert.deepEqual(feedbackPromptPayload.priorFeedback[0].incorrectSections, ["evidence-validation", "unresolved-questions"]);
assert.ok(feedbackPrompt.includes("incorrectSections"));
assert.equal(feedbackPromptPayload.contextIncluded.priorFeedbackItems, 1);

const feedbackLocal = SummarizeThis.buildRuleBasedAnalysis(cardWithPriorFeedback);
assert.ok(feedbackLocal.summary.history.includes("prior correction"));
assert.ok(feedbackLocal.summary.recommendations.some(item => item.includes("prior corrections")));

const normalizedBudget = SummarizeThis.normalizeBudgetSettings({
  warningPercent: 75,
  providerMonthlyLimits: {
    openai: "0.01",
    google: "2.50",
    anthropic: "-1"
  }
});
assert.equal(normalizedBudget.warningPercent, 75);
assert.equal(normalizedBudget.providerMonthlyLimits.openai, 0.01);
assert.equal(normalizedBudget.providerMonthlyLimits.google, 2.5);
assert.equal(normalizedBudget.providerMonthlyLimits.anthropic, 0);

const costRecord = SummarizeThis.createCostRecord({
  provider: "OpenAI",
  model: "gpt-4o-mini",
  tokens: 800,
  cost: 0.004
}, {
  analysisRunId: "run-cost-1",
  cardId: "card-cost",
  cardTitle: "Card with budget tracking",
  now: "2026-06-29T12:20:00.000Z"
});
assert.equal(costRecord.providerKey, "openai");
assert.equal(costRecord.cost, 0.004);
assert.equal(costRecord.createdAt, "2026-06-29T12:20:00.000Z");

const providerTotals = SummarizeThis.summarizeMonthlyProviderCosts([
  costRecord,
  SummarizeThis.createCostRecord({ provider: "OpenAI", cost: 0.002 }, { now: "2026-06-01T08:00:00.000Z" }),
  SummarizeThis.createCostRecord({ provider: "Google AI", cost: 0.5 }, { now: "2026-06-02T08:00:00.000Z" }),
  SummarizeThis.createCostRecord({ provider: "OpenAI", cost: 10 }, { now: "2026-05-30T08:00:00.000Z" })
], "2026-06");
assert.equal(Number(providerTotals.openai.toFixed(3)), 0.006);
assert.equal(providerTotals.google, 0.5);

const budgetWarning = SummarizeThis.evaluateBudgetAlert([costRecord], {
  provider: "OpenAI",
  model: "gpt-4o-mini",
  tokens: 100,
  cost: 0.004
}, normalizedBudget, {
  now: "2026-06-29T12:25:00.000Z"
});
assert.equal(budgetWarning.status, "warning");
assert.ok(budgetWarning.message.includes("OpenAI monthly budget warning"));
assert.equal(Number(budgetWarning.projectedTotal.toFixed(3)), 0.008);

const budgetExceeded = SummarizeThis.evaluateBudgetAlert([costRecord], {
  provider: "OpenAI",
  cost: 0.02
}, normalizedBudget, {
  now: "2026-06-29T12:30:00.000Z"
});
assert.equal(budgetExceeded.status, "exceeded");
assert.ok(budgetExceeded.message.includes("would be exceeded"));

const budgetDisabled = SummarizeThis.evaluateBudgetAlert([], {
  provider: "Local rules",
  cost: 0
}, normalizedBudget, {
  now: "2026-06-29T12:35:00.000Z"
});
assert.equal(budgetDisabled.status, "disabled");

const timingRecord = SummarizeThis.createRuntimeTimingRecord([
  { key: "context", label: "Card context read", durationMs: 12.4 },
  { key: "local-summary", label: "Local summary", durationMs: 3.2 },
  { key: "negative", label: "Negative timing is clamped", durationMs: -5 }
], {
  analysisRunId: "run-timing-1",
  cardId: "card-timing",
  provider: "Local rules",
  source: "local",
  totalMs: 20.8,
  now: "2026-06-29T12:40:00.000Z"
});
assert.equal(timingRecord.analysisRunId, "run-timing-1");
assert.equal(timingRecord.totalMs, 21);
assert.equal(timingRecord.stages.length, 3);
assert.equal(timingRecord.stages[0].durationMs, 12);
assert.equal(timingRecord.stages[2].durationMs, 0);
assert.equal(timingRecord.createdAt, "2026-06-29T12:40:00.000Z");

const timingSummary = SummarizeThis.summarizeRuntimeTimingRecords([
  timingRecord,
  { totalMs: 100 },
  { totalMs: 0 }
]);
assert.equal(timingSummary.count, 2);
assert.equal(timingSummary.latestMs, 21);
assert.equal(timingSummary.averageMs, 61);
assert.equal(timingSummary.maxMs, 100);

function parsePromptPayload(promptText) {
  return JSON.parse(promptText.slice(promptText.lastIndexOf("\n{") + 1));
}

const largeCard = Object.assign({}, sample, {
  desc: "Long description ".repeat(400),
  comments: Array.from({ length: 25 }, (_, index) => ({
    text: `Comment ${index + 1} ` + "detail ".repeat(250)
  })),
  actions: Array.from({ length: 30 }, (_, index) => ({
    id: `action-${index + 1}`,
    type: index === 0 ? "updateCard" : "addLabelToCard",
    text: `Activity ${index + 1}`,
    memberCreator: { fullName: "Jamie" }
  }))
});
const largePromptPayload = parsePromptPayload(SummarizeThis.buildAIPrompt(largeCard));
assert.ok(largePromptPayload.description.length <= 2500);
assert.equal(largePromptPayload.comments.length, 12);
assert.equal(largePromptPayload.activity.length, 12);
assert.ok(largePromptPayload.comments.every(comment => comment.text.length <= 700));
assert.equal(largePromptPayload.contextIncluded.commentLimit, 12);
assert.equal(largePromptPayload.contextIncluded.commentCharacters, 700);

const expandedPromptPayload = parsePromptPayload(SummarizeThis.buildAIPrompt(largeCard, {
  promptContext: {
    descriptionCharacters: 4000,
    commentLimit: 20,
    commentCharacters: 1200
  }
}));
assert.ok(expandedPromptPayload.description.length <= 4000);
assert.equal(expandedPromptPayload.comments.length, 20);
assert.ok(expandedPromptPayload.comments.every(comment => comment.text.length <= 1200));
assert.equal(expandedPromptPayload.contextIncluded.commentsAvailable, 25);
assert.equal(expandedPromptPayload.contextIncluded.commentsIncluded, 20);

const clampedContext = SummarizeThis.normalizePromptContext({
  descriptionCharacters: 999999,
  commentLimit: 999,
  commentCharacters: 999999
});
assert.equal(clampedContext.descriptionCharacters, 5000);
assert.equal(clampedContext.commentLimit, 25);
assert.equal(clampedContext.commentCharacters, 1500);

const fallback = local.summary;
const aiSummary = SummarizeThis.normalizeAIAnalysis({
  about: "AI about",
  history: "AI history",
  status: "AI status",
  nextSteps: ["Do the thing"],
  blockers: [{ text: "Waiting on Robert approval" }],
  waitingOn: [{ text: "Waiting on Robert approval and client invoice reply" }],
  robertDecisions: [{ question: "Approve VA follow-up? Yes/No" }],
  vaReadyActions: [{ action: "VA collect the missing screenshot" }],
  insights: ["Useful insight"],
  risks: [],
  missingInfo: ["Invoice amount is not in the card"],
  unclearPoints: [{ text: "Card says billing is complete but invoice amount is missing" }],
  unresolvedQuestions: ["Who owns the invoice amount confirmation?"],
  facts: ["The card includes a billing checklist."],
  inferences: ["Billing may still need follow-up."],
  uncertainty: ["The invoice amount is not visible in the card."],
  unsupportedClaims: ["The client has approved payment."],
  evidenceClaims: [{
    claim: "Billing is still open",
    source: "checklist",
    confidence: "supported"
  }],
  validationFindings: ["Attachment contents were not verified"],
  confidenceReason: "Description and checklist are present.",
  recommendations: ["Keep moving"],
  confidence: "high"
}, fallback);

assert.equal(aiSummary.about, "AI about");
assert.deepEqual(aiSummary.nextSteps, ["Do the thing"]);
assert.deepEqual(aiSummary.blockers, ["Waiting on Robert approval"]);
assert.deepEqual(aiSummary.waitingOn, ["Waiting on Robert approval and client invoice reply"]);
assert.deepEqual(aiSummary.robertDecisions, ["Approve VA follow-up? Yes/No"]);
assert.deepEqual(aiSummary.vaReadyActions, ["VA collect the missing screenshot"]);
assert.deepEqual(aiSummary.missingInfo, ["Invoice amount is not in the card"]);
assert.deepEqual(aiSummary.unclearPoints, ["Card says billing is complete but invoice amount is missing"]);
assert.deepEqual(aiSummary.unresolvedQuestions, ["Who owns the invoice amount confirmation?"]);
assert.equal(aiSummary.evidenceClaims[0].claim, "Billing is still open");
assert.equal(aiSummary.validationFindings[0], "Attachment contents were not verified");
assert.deepEqual(aiSummary.facts, ["The card includes a billing checklist."]);
assert.deepEqual(aiSummary.inferences, ["Billing may still need follow-up."]);
assert.deepEqual(aiSummary.uncertainty, ["The invoice amount is not visible in the card."]);
assert.deepEqual(aiSummary.unsupportedClaims, ["The client has approved payment."]);
assert.equal(aiSummary.confidenceReason, "Description and checklist are present.");
assert.equal(aiSummary.confidence, "high");

const markdown = SummarizeThis.markdownForAnalysis(sample, local);
assert.ok(markdown.includes("## Current status"));
assert.ok(markdown.includes("- Billing flow checked"));

const operationalCard = Object.assign({}, sample, {
  id: "card-robert-va",
  desc: "Client launch is waiting on invoice approval. Robert must approve whether the VA may send the follow-up today.",
  due: new Date(Date.now() - 86400000).toISOString(),
  dueComplete: true,
  members: [],
  comments: [{
    text: "Blocked until Robert confirms yes/no on sending the payment reminder.",
    date: new Date().toISOString(),
    memberCreator: { fullName: "Jamie" }
  }],
  attachments: [{
    id: "invoice",
    name: "invoice.pdf",
    processed: true,
    extractedText: "",
    error: ""
  }],
  actions: [{
    id: "action-robert",
    type: "updateCard",
    text: "Moved card to Waiting on Robert",
    date: new Date().toISOString(),
    memberCreator: { fullName: "Jamie" }
  }]
});
const operationalAnalysis = {
  summary: {
    about: "Client launch follow-up needs payment reminder approval.",
    history: "The latest comment says the card is blocked until Robert confirms.",
    status: "Waiting on Robert approval and overdue.",
    nextSteps: [
      "Robert approve whether VA may send the follow-up message.",
      "VA collect the missing screenshot and update the card."
    ],
    insights: ["Payment and client communication need review."],
    risks: ["Blocked by approval.", "Invoice attachment content was not verified."],
    recommendations: ["Approve: Yes/No for VA follow-up."]
  },
  metadata: {
    provider: "Local rules",
    model: "built-in summarizer",
    tokens: 0,
    cost: 0
  }
};
const snapshot = CardIntelligenceLedger.createCardSnapshot(operationalCard, {
  now: "2026-06-29T12:00:00.000Z"
});
assert.equal(snapshot.cardId, "card-robert-va");
assert.equal(snapshot.descriptionPresent, true);
assert.ok(snapshot.descriptionHash);
assert.equal(snapshot.description, undefined);
assert.equal(snapshot.customFieldCount, 2);
assert.equal(snapshot.activityCount, 1);
assert.equal(snapshot.linkedDocumentCount, 1);
assert.ok(snapshot.attachmentCategories.includes("document"));
assert.ok(snapshot.sourceCoverage.some(item => item.key === "comments" && item.status === "available"));
assert.ok(snapshot.sourceCoverage.some(item => item.key === "activity" && item.status === "available"));
assert.ok(snapshot.listContext);
assert.ok(snapshot.sourceCoverage.some(item => item.key === "listContext" && item.status === "available"));
assert.ok(snapshot.sourceCoverage.some(item => item.key === "customFields" && item.status === "available"));

const feedbackSnapshot = CardIntelligenceLedger.createCardSnapshot(cardWithPriorFeedback, {
  now: "2026-06-29T12:00:15.000Z"
});
assert.equal(feedbackSnapshot.priorFeedbackCount, 1);
assert.ok(feedbackSnapshot.sourceCoverage.some(item => item.key === "priorFeedback" && item.status === "available"));

const partialCoverage = CardIntelligenceLedger.createSourceCoverage(Object.assign({}, sample, {
  comments: [],
  actions: [],
  checklists: [],
  attachments: [],
  badges: {
    comments: 3,
    checkItems: 2,
    checkItemsChecked: 1,
    attachments: 1
  },
  __sourceStatus: {
    comments: { ok: false, error: "Comment API was not available." },
    activity: { ok: false, error: "Activity API was not available." },
    board: { ok: false, error: "Board read failed." },
    list: { ok: true }
  }
}));
assert.ok(partialCoverage.some(item => item.key === "comments" && item.status === "failed"));
assert.ok(partialCoverage.some(item => item.key === "activity" && item.status === "failed"));
assert.ok(partialCoverage.some(item => item.key === "checklists" && item.status === "partial"));
assert.ok(partialCoverage.some(item => item.key === "attachments" && item.status === "partial"));
assert.ok(partialCoverage.some(item => item.key === "board" && item.detail.includes("Board read failed")));

const attachmentRun = CardIntelligenceLedger.createAnalysisRun(sample, local, {
  now: "2026-06-29T12:00:10.000Z"
});
assert.equal(attachmentRun.cardSnapshot.transcriptCount, 1);
assert.equal(attachmentRun.cardSnapshot.recordingCount, 1);
assert.ok(attachmentRun.cardSnapshot.sourceCoverage.some(item => item.key === "attachments" && item.detail.includes("Metadata types")));
assert.ok(attachmentRun.result.validationFindings.some(item => item.id === "attachment-transcript-unverified"));
assert.ok(attachmentRun.result.validationFindings.some(item => item.id === "attachment-recording-unverified"));
assert.ok(attachmentRun.result.missingInfo.some(item => item.id === "attachment-transcript-unverified"));
assert.ok(attachmentRun.result.evidence.some(item => item.type === "attachment" && item.excerpt.includes("[recording]")));
const attachmentFacts = CardIntelligenceLedger.createAttachmentFacts(sample);
assert.equal(attachmentFacts.total, 3);
assert.equal(attachmentFacts.extracted, 0);
assert.ok(attachmentFacts.summary.includes("metadata-only"));
assert.ok(attachmentFacts.categories.includes("recording"));
assert.ok(attachmentFacts.facts.some(item => item.detail.includes("demo-recording.mp4") && item.detail.includes("metadata only")));

const run = CardIntelligenceLedger.createAnalysisRun(operationalCard, operationalAnalysis, {
  now: "2026-06-29T12:00:00.000Z",
  outputMode: "meeting-brief",
  outputLanguage: "nl",
  promptTemplateId: "robert-approval",
  promptTemplateName: "Robert approval review",
  customInstructions: "Prefer Yes/No decisions for Robert and keep VA-ready work separate."
});
assert.equal(run.status, "completed");
assert.equal(run.outputMode, "meeting-brief");
assert.equal(run.outputLanguage, "nl");
assert.equal(run.promptTemplateId, "robert-approval");
assert.equal(run.promptProfile.promptTemplateName, "Robert approval review");
assert.equal(run.promptProfile.outputLanguage, "nl");
assert.equal(run.promptProfile.customInstructionsPresent, true);
assert.equal(run.promptProfile.customInstructionsCharacters, 67);
assert.ok(run.result.blockers.length >= 2);
assert.ok(run.result.waitingOn.length >= 1);
assert.ok(run.result.unclearPoints.length >= 1);
assert.ok(run.result.robertDecisions.length >= 1);
assert.ok(run.result.vaReadyActions.length >= 1);
assert.ok(run.result.unresolvedQuestions.length >= 1);
assert.ok(run.result.nextActions.some(item => item.owner === "Robert" && item.priority === "high"));
assert.ok(run.result.blockers.some(item => item.severity === "high" || item.severity === "medium"));
assert.ok(run.result.waitingOn.some(item => item.owner === "Robert" || item.owner === "Robert/finance"));
assert.ok(run.result.unclearPoints.some(item => item.id === "unclear-due-checklist"));
assert.ok(run.result.robertDecisions.some(item => item.requiredBy === "Robert" && item.riskLevel));
assert.ok(run.result.vaReadyActions.some(item => item.owner === "VA/team" && item.needsRobert === false));
assert.ok(run.result.unresolvedQuestions.some(item => item.text.includes("Robert decision still open")));
assert.ok(run.result.evidenceClaims.every(claim => Array.isArray(claim.support)));
assert.ok(run.result.validationFindings.some(finding => finding.id === "decision-review"));
assert.ok(run.result.confidence.overall >= 25);
assert.ok(run.result.trustSignals.basedOn.some(item => item.key === "description"));
assert.ok(run.result.trustSignals.basedOn.some(item => item.key === "comments"));
assert.ok(run.result.trustSignals.basedOn.some(item => item.key === "activity"));
assert.ok(run.result.trustSignals.basedOn.some(item => item.key === "listContext"));
assert.ok(run.result.trustSignals.basedOn.some(item => item.key === "customFields"));
assert.ok(run.result.trustSignals.needsReview.some(item => item.key === "missing-members"));
assert.ok(run.result.trustSignals.whyScore.some(item => item.includes("Data completeness")));
assert.ok(run.result.evidence.some(item => item.type === "custom-field" && item.excerpt.includes("Priority")));
assert.ok(run.result.evidence.some(item => item.type === "activity" && item.excerpt.includes("Waiting on Robert")));
assert.deepEqual(run.result.insights, operationalAnalysis.summary.insights);
assert.deepEqual(run.result.recommendations, operationalAnalysis.summary.recommendations);

const staleRun = CardIntelligenceLedger.createAnalysisRun(Object.assign({}, operationalCard, {
  dateLastActivity: "2026-05-20T12:00:00.000Z",
  comments: [],
  actions: []
}), operationalAnalysis, {
  now: "2026-06-30T12:00:00.000Z"
});
assert.ok(staleRun.result.blockers.some(item => item.id === "blocker-stale-activity" && item.text.includes("41 days")));
assert.ok(staleRun.result.validationFindings.some(item => item.id === "stale-activity" && item.text.includes("41 days")));
assert.ok(staleRun.result.trustSignals.needsReview.some(item => item.key === "stale-activity"));
assert.ok(staleRun.result.unresolvedQuestions.some(item => item.text.includes("status should be refreshed") || item.text.includes("confirm current status")));

const sameInputHashLater = CardIntelligenceLedger.createInputHash(Object.assign({}, operationalCard));
const sameInputHashRun = CardIntelligenceLedger.createAnalysisRun(operationalCard, operationalAnalysis, {
  now: "2026-06-29T13:00:00.000Z"
});
const changedInputHash = CardIntelligenceLedger.createInputHash(Object.assign({}, operationalCard, {
  desc: operationalCard.desc + " Added new detail."
}));
assert.equal(run.inputHash, sameInputHashLater);
assert.equal(run.inputHash, sameInputHashRun.inputHash);
assert.notEqual(run.inputHash, changedInputHash);

const cachedProfileRun = CardIntelligenceLedger.createAnalysisRun(operationalCard, operationalAnalysis, {
  now: "2026-06-29T13:05:00.000Z",
  cacheProfileHash: "cacheabc",
  cacheProfile: {
    version: 1,
    analysisMode: "auto",
    providerMode: "fallback"
  }
});
assert.equal(cachedProfileRun.cacheProfileHash, "cacheabc");
assert.equal(cachedProfileRun.cacheProfile.providerMode, "fallback");

const operationalDigest = CardIntelligenceLedger.createOperationalDigest(run);
assert.equal(operationalDigest.length, 6);
assert.deepEqual(operationalDigest.map(item => item.key), [
  "current-status",
  "main-blocker",
  "top-next-action",
  "robert-decision",
  "va-handoff",
  "confidence"
]);
assert.equal(operationalDigest.find(item => item.key === "main-blocker").tone, "warning");
assert.ok(operationalDigest.find(item => item.key === "main-blocker").value.length > 20);
assert.ok(operationalDigest.find(item => item.key === "top-next-action").value.includes("owner: Robert"));
assert.ok(operationalDigest.find(item => item.key === "robert-decision").value.includes("Approve: Yes/No"));
assert.ok(operationalDigest.find(item => item.key === "va-handoff").value.includes("Robert approval: no"));
assert.ok(operationalDigest.find(item => item.key === "confidence").value.includes("%"));

const sparseTrustSignals = CardIntelligenceLedger.createAnalysisRun(Object.assign({}, sample, {
  desc: "",
  comments: [],
  members: [],
  checklists: [],
  due: null,
  badges: {
    comments: 0,
    checkItems: 0,
    checkItemsChecked: 0,
    attachments: 0
  }
}), operationalAnalysis, {
  now: "2026-06-29T12:00:30.000Z"
}).result.trustSignals;
assert.ok(sparseTrustSignals.needsReview.some(item => item.label === "No description"));
assert.ok(sparseTrustSignals.needsReview.some(item => item.label === "No owner"));
assert.ok(sparseTrustSignals.needsReview.some(item => item.label === "No comments"));

const failedReadRun = CardIntelligenceLedger.createAnalysisRun(Object.assign({}, sample, {
  __sourceStatus: {
    comments: { ok: false, error: "Comment API was not available." },
    activity: { ok: false, error: "Activity API was not available." }
  }
}), operationalAnalysis, {
  now: "2026-06-29T12:00:45.000Z"
});
assert.ok(failedReadRun.cardSnapshot.sourceCoverage.some(item => item.key === "comments" && item.status === "failed"));
assert.ok(failedReadRun.cardSnapshot.sourceCoverage.some(item => item.key === "activity" && item.status === "failed"));
assert.ok(failedReadRun.result.trustSignals.needsReview.some(item => item.key === "comments-failed"));
assert.ok(failedReadRun.result.trustSignals.needsReview.some(item => item.key === "activity-failed"));

const aiStructuredRun = CardIntelligenceLedger.createAnalysisRun(operationalCard, {
  summary: aiSummary,
  metadata: {
    provider: "OpenAI",
    model: "gpt-4o-mini",
    tokens: 500,
    cost: 0.001
  },
  source: "ai"
}, {
  now: "2026-06-29T12:01:00.000Z"
});
assert.ok(aiStructuredRun.result.blockers.some(item => item.text.includes("Waiting on Robert approval")));
assert.ok(aiStructuredRun.result.waitingOn.some(item => item.text.includes("Waiting on Robert approval")));
assert.ok(aiStructuredRun.result.unclearPoints.some(item => item.text.includes("billing is complete")));
assert.ok(aiStructuredRun.result.robertDecisions.some(item => item.text.includes("Approve: Yes/No")));
assert.ok(aiStructuredRun.result.vaReadyActions.some(item => item.text.includes("VA collect the missing screenshot")));
assert.ok(aiStructuredRun.result.missingInfo.some(item => item.text.includes("Invoice amount")));
assert.ok(aiStructuredRun.result.unresolvedQuestions.some(item => item.text.includes("Who owns the invoice amount confirmation")));
assert.ok(aiStructuredRun.result.evidenceClaims.some(item => item.claim.includes("Billing is still open")));
assert.ok(aiStructuredRun.result.validationFindings.some(item => item.text.includes("Attachment contents")));
assert.ok(aiStructuredRun.result.validationFindings.some(item => item.id === "ai-output-unverified"));
assert.ok(aiStructuredRun.result.validationFindings.some(item => item.text.includes("Inference (not a verified fact)")));
assert.ok(aiStructuredRun.result.validationFindings.some(item => item.text.includes("Uncertainty:")));
assert.ok(aiStructuredRun.result.validationFindings.some(item => item.text.includes("Unsupported claim:")));
assert.ok(aiStructuredRun.result.evidenceClaims.every(item => item.confidence === "uncertain"));
assert.deepEqual(aiStructuredRun.result.inferences, ["Billing may still need follow-up."]);
assert.equal(aiStructuredRun.result.confidenceReason, "Description and checklist are present.");

const history = CardIntelligenceLedger.mergeLedgerHistory([], { lastRun: run }, 25);
assert.equal(history.length, 1);
assert.equal(history[0].id, run.id);

const changedRun = CardIntelligenceLedger.createAnalysisRun(Object.assign({}, operationalCard, {
  desc: operationalCard.desc + " The VA added a new screenshot request.",
  comments: operationalCard.comments.concat([{
    text: "VA can collect the screenshot after Robert approves the message.",
    date: "2026-06-29T12:10:00.000Z",
    memberCreator: { fullName: "Sam" }
  }])
}), operationalAnalysis, {
  now: "2026-06-29T12:10:00.000Z"
});
const changedHistory = CardIntelligenceLedger.mergeLedgerHistory(history, changedRun, 25);
assert.equal(changedHistory.length, 2);
const runChange = CardIntelligenceLedger.summarizeRunChange(changedHistory[0], changedHistory[1]);
assert.ok(runChange.changes.some(change => change.includes("Card source data changed")));
assert.ok(runChange.changes.some(change => change.includes("Comment count changed")));
assert.ok(["up", "down", "flat"].includes(runChange.confidenceTrend));
const changeBrief = CardIntelligenceLedger.changeBriefForLedgerRuns(changedHistory[0], changedHistory[1]);
assert.ok(changeBrief.includes("Change brief:"));
assert.ok(changeBrief.includes("Operational changes:"));
assert.ok(changeBrief.includes("Card source data changed"));
assert.ok(changeBrief.includes("Current Robert decision:"));
assert.ok(changeBrief.includes("Review note:"));

const firstRunChange = CardIntelligenceLedger.summarizeRunChange(run, null);
assert.equal(firstRunChange.confidenceTrend, "new");
assert.ok(firstRunChange.text.includes("First saved analysis"));

const feedback = CardIntelligenceLedger.createHumanFeedback(run.id, {
  rating: "wrong",
  correctionText: "The invoice amount is still missing.",
  incorrectSections: ["robert-decisions", "va-team-actions"],
  cardId: run.cardId,
  cardTitle: run.cardSnapshot.title
}, {
  now: "2026-06-29T12:05:00.000Z"
});
assert.equal(feedback.analysisRunId, run.id);
assert.equal(feedback.correctionText, "The invoice amount is still missing.");
assert.deepEqual(feedback.incorrectSections, ["robert-decisions", "va-team-actions"]);
assert.equal(feedback.cardId, run.cardId);

const reviewRecord = CardIntelligenceLedger.createReviewRecord(run.id, {
  state: "needs-follow-up",
  note: "Robert should review the approval wording before use.",
  cardId: run.cardId,
  cardTitle: run.cardSnapshot.title,
  reviewNeededAtCreation: run.result.confidence.reviewNeeded,
  confidence: run.result.confidence
}, {
  now: "2026-06-29T12:05:30.000Z"
});
assert.equal(reviewRecord.analysisRunId, run.id);
assert.equal(reviewRecord.state, "needs-follow-up");
assert.equal(reviewRecord.label, "Needs follow-up");
assert.equal(reviewRecord.cardId, run.cardId);
assert.equal(reviewRecord.createdAt, "2026-06-29T12:05:30.000Z");

const summarizedReviews = CardIntelligenceLedger.summarizeReviewRecords([
  reviewRecord,
  CardIntelligenceLedger.createReviewRecord("other-run", { state: "accepted" }, {
    now: "2026-06-29T12:05:35.000Z"
  }),
  CardIntelligenceLedger.createReviewRecord(run.id, { state: "accepted" }, {
    now: "2026-06-29T12:05:40.000Z"
  })
], [run.id], 5);
assert.equal(summarizedReviews.length, 2);
assert.equal(summarizedReviews[0].state, "accepted");
assert.equal(summarizedReviews[1].state, "needs-follow-up");

const exportRecord = CardIntelligenceLedger.createExportRecord(run.id, "markdown", "clipboard", {
  now: "2026-06-29T12:06:00.000Z"
});
assert.equal(exportRecord.destination, "clipboard");
assert.equal(exportRecord.sensitiveReview, null);

const blockedSensitiveExport = CardIntelligenceLedger.createSensitiveActionReview(sensitiveSignals, "ledger-json", false, {
  now: "2026-06-29T12:06:30.000Z"
});
assert.equal(blockedSensitiveExport.required, true);
assert.equal(blockedSensitiveExport.requiresApproval, true);
assert.ok(blockedSensitiveExport.categories.includes("client"));

const approvedSensitiveExport = CardIntelligenceLedger.createSensitiveActionReview(sensitiveSignals, "ledger-json", true, {
  now: "2026-06-29T12:06:45.000Z"
});
assert.equal(approvedSensitiveExport.requiresApproval, false);
assert.equal(approvedSensitiveExport.approved, true);
assert.equal(approvedSensitiveExport.reviewedAt, "2026-06-29T12:06:45.000Z");

const sensitiveExportRecord = CardIntelligenceLedger.createExportRecord(run.id, "ledger-json", "download", {
  now: "2026-06-29T12:06:50.000Z",
  sensitiveReview: approvedSensitiveExport,
  cardId: run.cardId,
  cardTitle: run.cardSnapshot.title
});
assert.equal(sensitiveExportRecord.sensitiveReview.required, true);
assert.equal(sensitiveExportRecord.sensitiveReview.approved, true);
assert.ok(sensitiveExportRecord.sensitiveReview.categories.includes("financial"));
assert.equal(sensitiveExportRecord.cardId, run.cardId);
const manualBatchExportRecord = CardIntelligenceLedger.createExportRecord(run.id, "batch-manual-checklist", "clipboard", {
  now: "2026-06-29T12:06:58.000Z",
  cardId: run.cardId
});
const manualBatchPanelRecord = CardIntelligenceLedger.createExportRecord(run.id, "batch-manual-checklist", "manual-copy-panel", {
  now: "2026-06-29T12:06:58.500Z",
  cardId: run.cardId
});
const batchHandoffPanelRecord = CardIntelligenceLedger.createExportRecord(run.id, "batch-handoff-report", "manual-copy-panel", {
  now: "2026-06-29T12:06:58.700Z",
  cardId: run.cardId
});
const batchOpenRecord = CardIntelligenceLedger.createExportRecord(run.id, "batch-open-card", "browser-tab", {
  now: "2026-06-29T12:06:59.000Z",
  cardId: run.cardId
});
const decisionPacketRecord = CardIntelligenceLedger.createExportRecord(run.id, "decision-handoff-packet", "manual-copy-panel", {
  now: "2026-06-29T12:06:59.500Z",
  cardId: run.cardId
});
const summarizedDecisionPacketRecords = CardIntelligenceLedger.summarizeExportRecords([decisionPacketRecord], [run.id], 1);
assert.equal(summarizedDecisionPacketRecords[0].exportLabel, "Decision handoff packet");
assert.equal(summarizedDecisionPacketRecords[0].destinationLabel, "prepared for manual copy");
const summarizedManualBatchRecords = CardIntelligenceLedger.summarizeExportRecords([
  manualBatchExportRecord,
  manualBatchPanelRecord,
  batchHandoffPanelRecord,
  batchOpenRecord
], [run.id], 4);
assert.equal(summarizedManualBatchRecords[0].exportLabel, "Batch card opened");
assert.equal(summarizedManualBatchRecords[0].destinationLabel, "opened in browser");
assert.equal(summarizedManualBatchRecords[1].exportLabel, "Batch handoff report");
assert.equal(summarizedManualBatchRecords[1].destinationLabel, "prepared for manual copy");
assert.equal(summarizedManualBatchRecords[2].exportLabel, "Manual batch checklist");
assert.equal(summarizedManualBatchRecords[3].exportLabel, "Manual batch checklist");

const summarizedExports = CardIntelligenceLedger.summarizeExportRecords([
  sensitiveExportRecord,
  CardIntelligenceLedger.createExportRecord(run.id, "batch-plan-json", "clipboard", {
    now: "2026-06-29T12:07:00.000Z",
    cardId: run.cardId
  }),
  CardIntelligenceLedger.createExportRecord(run.id, "robert-decision-brief", "clipboard", {
    now: "2026-06-29T12:07:02.000Z",
    cardId: run.cardId
  }),
  CardIntelligenceLedger.createExportRecord(run.id, "va-handoff-brief", "clipboard", {
    now: "2026-06-29T12:07:03.000Z",
    cardId: run.cardId
  }),
  CardIntelligenceLedger.createExportRecord(run.id, "change-brief", "clipboard", {
    now: "2026-06-29T12:07:04.500Z",
    cardId: run.cardId
  }),
  CardIntelligenceLedger.createExportRecord(run.id, "operational-digest", "clipboard", {
    now: "2026-06-29T12:07:04.000Z",
    cardId: run.cardId
  }),
  CardIntelligenceLedger.createExportRecord(run.id, "list-planning-json", "clipboard", {
    now: "2026-06-29T12:06:50.000Z",
    cardId: run.cardId
  }),
  CardIntelligenceLedger.createExportRecord("other-run", "markdown", "clipboard", {
    now: "2026-06-29T12:06:55.000Z"
  }),
  CardIntelligenceLedger.createExportRecord(run.id, "trello-comment", "trello-comment", {
    now: "2026-06-29T12:07:05.000Z",
    cardId: run.cardId
  })
], [run.id], 8);
assert.equal(summarizedExports.length, 8);
assert.equal(summarizedExports[0].exportLabel, "Trello comment");
assert.equal(summarizedExports[0].destinationLabel, "posted to Trello");
assert.equal(summarizedExports[1].exportLabel, "Change brief");
assert.equal(summarizedExports[2].exportLabel, "Operational digest");
assert.equal(summarizedExports[3].exportLabel, "VA/team handoff brief");
assert.equal(summarizedExports[4].exportLabel, "Robert decision brief");
assert.equal(summarizedExports[5].exportLabel, "Batch analysis JSON");
assert.equal(summarizedExports[6].exportLabel, "Ledger JSON");
assert.equal(summarizedExports[6].sensitiveReviewApproved, true);
assert.equal(summarizedExports[7].exportLabel, "List planning JSON");

const ledgerMarkdown = CardIntelligenceLedger.markdownForLedgerRun(run);
assert.ok(ledgerMarkdown.includes("## Robert decisions"));
assert.ok(ledgerMarkdown.includes("## Waiting on"));
assert.ok(ledgerMarkdown.includes("## Unclear or conflicting points"));
assert.ok(ledgerMarkdown.includes("## Unresolved questions"));
assert.ok(ledgerMarkdown.includes("VA collect"));
assert.ok(ledgerMarkdown.includes("owner: Robert"));
assert.ok(ledgerMarkdown.includes("priority: high"));
assert.ok(ledgerMarkdown.includes("required by: Robert"));
assert.ok(ledgerMarkdown.includes("Robert approval: no"));
assert.ok(ledgerMarkdown.includes("## Evidence-backed claims"));
assert.ok(ledgerMarkdown.includes("## Source coverage"));
assert.ok(ledgerMarkdown.includes("Attachments (partial):"));

const ledgerPlainText = CardIntelligenceLedger.plainTextForLedgerRun(run);
assert.ok(ledgerPlainText.includes("Trello Card Intelligence"));
assert.ok(ledgerPlainText.includes("Missing information:"));
assert.ok(ledgerPlainText.includes("Waiting on:"));
assert.ok(ledgerPlainText.includes("Unclear or conflicting points:"));
assert.ok(ledgerPlainText.includes("Robert decisions:"));
assert.ok(ledgerPlainText.includes("Unresolved questions:"));
assert.ok(ledgerPlainText.includes("Evidence-backed claims:"));
assert.ok(ledgerPlainText.includes("Source coverage:"));

const ledgerStatusUpdate = CardIntelligenceLedger.statusUpdateForLedgerRun(run);
assert.ok(ledgerStatusUpdate.includes("Status update:"));
assert.ok(ledgerStatusUpdate.includes("Top next action:"));
assert.ok(ledgerStatusUpdate.includes("owner: Robert"));
assert.ok(ledgerStatusUpdate.includes("Waiting on:"));
assert.ok(ledgerStatusUpdate.includes("Unclear point:"));
assert.ok(ledgerStatusUpdate.includes("Open question:"));
assert.ok(ledgerStatusUpdate.includes("VA/team handoff:"));
assert.ok(ledgerStatusUpdate.includes("Source coverage:"));

const operationalDigestText = CardIntelligenceLedger.operationalDigestForLedgerRun(run);
assert.ok(operationalDigestText.includes("Operational digest:"));
assert.ok(operationalDigestText.includes("Current status:"));
assert.ok(operationalDigestText.includes("Main blocker:"));
assert.ok(operationalDigestText.includes("Top next action:"));
assert.ok(operationalDigestText.includes("Robert decision:"));
assert.ok(operationalDigestText.includes("VA/team handoff:"));
assert.ok(operationalDigestText.includes("Confidence:"));
assert.ok(operationalDigestText.includes("Source coverage:"));

const robertDecisionBrief = CardIntelligenceLedger.robertDecisionBriefForLedgerRun(run);
assert.ok(robertDecisionBrief.includes("Robert decision brief:"));
assert.ok(robertDecisionBrief.includes("Decision needed:"));
assert.ok(robertDecisionBrief.includes("Yes/No framing:"));
assert.ok(robertDecisionBrief.includes("Waiting on:"));
assert.ok(robertDecisionBrief.includes("Unclear or conflicting points:"));
assert.ok(robertDecisionBrief.includes("Unresolved questions:"));
assert.ok(robertDecisionBrief.includes("Evidence-backed claims:"));
assert.ok(robertDecisionBrief.includes("Source coverage:"));
assert.equal(robertDecisionBrief.includes("Prefer Yes/No decisions"), false);

const vaHandoffBrief = CardIntelligenceLedger.vaHandoffBriefForLedgerRun(run);
assert.ok(vaHandoffBrief.includes("VA/team handoff:"));
assert.ok(vaHandoffBrief.includes("VA/team-ready actions:"));
assert.ok(vaHandoffBrief.includes("Blockers to avoid:"));
assert.ok(vaHandoffBrief.includes("Waiting on:"));
assert.ok(vaHandoffBrief.includes("Unclear or conflicting points:"));
assert.ok(vaHandoffBrief.includes("Unresolved questions:"));
assert.ok(vaHandoffBrief.includes("Robert decisions not delegated:"));
assert.ok(vaHandoffBrief.includes("Evidence-backed claims:"));
assert.ok(vaHandoffBrief.includes("Source coverage:"));
assert.equal(vaHandoffBrief.includes("Prefer Yes/No decisions"), false);

const decisionHandoffPacket = CardIntelligenceLedger.decisionHandoffPacketForLedgerRun(run, {
  batchProgress: trackedBatchProgress
});
assert.ok(decisionHandoffPacket.includes("Decision handoff packet:"));
assert.ok(decisionHandoffPacket.includes("Robert decision:"));
assert.ok(decisionHandoffPacket.includes("Yes/No framing:"));
assert.ok(decisionHandoffPacket.includes("VA/team-ready actions:"));
assert.ok(decisionHandoffPacket.includes("Blockers / waiting:"));
assert.ok(decisionHandoffPacket.includes("Batch progress:"));
assert.ok(decisionHandoffPacket.includes("2 of 4 card(s) done; 2 need attention."));
assert.ok(decisionHandoffPacket.includes("2. Prepare launch checklist: analyzed; mode"));
assert.ok(decisionHandoffPacket.includes("Handoff rules:"));
assert.ok(decisionHandoffPacket.includes("Evidence-backed claims:"));
assert.ok(decisionHandoffPacket.includes("Source coverage:"));
assert.equal(decisionHandoffPacket.includes("Prefer Yes/No decisions"), false);
assert.equal(decisionHandoffPacket.includes("Finalize the launch checklist"), false);

const meetingBrief = CardIntelligenceLedger.modeBriefForLedgerRun(run);
assert.ok(meetingBrief.includes("Meeting brief:"));
assert.ok(meetingBrief.includes("Decisions to cover:"));
assert.ok(meetingBrief.includes("Waiting on:"));
assert.ok(meetingBrief.includes("Unclear or conflicting points:"));
assert.ok(meetingBrief.includes("Unresolved questions:"));
assert.ok(meetingBrief.includes("Source coverage:"));

const riskBrief = CardIntelligenceLedger.modeBriefForLedgerRun(run, "risk-review");
assert.ok(riskBrief.includes("Risk review:"));
assert.ok(riskBrief.includes("Validation findings:"));
assert.ok(riskBrief.includes("Waiting on:"));
assert.ok(riskBrief.includes("Unclear or conflicting points:"));
assert.ok(riskBrief.includes("Unresolved questions:"));
assert.ok(riskBrief.includes("Evidence-backed claims:"));

const checklistBrief = CardIntelligenceLedger.modeBriefForLedgerRun(run, "next-action-checklist");
assert.ok(checklistBrief.includes("Next-action checklist:"));
assert.ok(checklistBrief.includes("- [ ]"));
assert.ok(checklistBrief.includes("owner: Robert"));
assert.ok(checklistBrief.includes("Waiting on:"));
assert.ok(checklistBrief.includes("Unclear or conflicting points:"));
assert.ok(checklistBrief.includes("Questions to resolve:"));
assert.ok(checklistBrief.includes("Evidence-backed claims:"));

const ledgerJson = JSON.parse(CardIntelligenceLedger.jsonForLedgerRun(run, {
  now: "2026-06-29T12:07:00.000Z"
}));
assert.equal(ledgerJson.schemaVersion, "summarize-this-card-intelligence-export-v1");
assert.equal(ledgerJson.exportedAt, "2026-06-29T12:07:00.000Z");
assert.equal(ledgerJson.analysisRun.id, run.id);
assert.equal(ledgerJson.analysisRun.outputMode, "meeting-brief");
assert.equal(ledgerJson.analysisRun.outputLanguage, "nl");
assert.equal(ledgerJson.analysisRun.promptProfile.promptTemplateId, "robert-approval");
assert.equal(ledgerJson.analysisRun.promptProfile.promptTemplateName, "Robert approval review");
assert.equal(ledgerJson.analysisRun.promptProfile.outputLanguage, "nl");
assert.equal(ledgerJson.analysisRun.promptProfile.customInstructionsPresent, true);
assert.ok(ledgerJson.analysisRun.promptProfile.customInstructionsHash);
assert.equal(JSON.stringify(ledgerJson).includes("Prefer Yes/No decisions"), false);
assert.equal(ledgerJson.cardSnapshot.description, undefined);
assert.ok(Array.isArray(ledgerJson.result.blockers));
assert.ok(Array.isArray(ledgerJson.result.waitingOn));
assert.ok(Array.isArray(ledgerJson.result.unclearPoints));
assert.ok(Array.isArray(ledgerJson.result.unresolvedQuestions));

const trelloCommentDraft = CardIntelligenceLedger.createTrelloCommentDraft(run);
assert.ok(trelloCommentDraft.includes("Summarize This - Card Intelligence"));
assert.ok(trelloCommentDraft.includes("Robert decisions:"));
assert.ok(trelloCommentDraft.includes("VA/team-ready actions:"));
assert.ok(trelloCommentDraft.includes("Waiting on:"));
assert.ok(trelloCommentDraft.includes("Unclear or conflicting points:"));
assert.ok(trelloCommentDraft.includes("Unresolved questions:"));
assert.ok(trelloCommentDraft.includes("Confidence:"));
assert.ok(trelloCommentDraft.includes("Evidence notes:"));
assert.ok(trelloCommentDraft.includes("Source coverage:"));
assert.ok(trelloCommentDraft.includes("Review note:"));
assert.ok(trelloCommentDraft.length <= 4000);

const trelloDescriptionDraft = CardIntelligenceLedger.createTrelloDescriptionDraft(run);
assert.ok(trelloDescriptionDraft.includes("## Operational summary"));
assert.ok(trelloDescriptionDraft.includes("### Current status"));
assert.ok(trelloDescriptionDraft.includes("### Next actions"));
assert.ok(trelloDescriptionDraft.includes("### Review note"));
assert.match(trelloDescriptionDraft, /not verified fact/i);
assert.ok(trelloDescriptionDraft.length <= 6028);

const adminConfig = TrelloAdminConfig.createAdminConfig({
  name: "Summarize This",
  details: "Evidence-backed Trello card intelligence.",
  author: "Noodzakelijk Online",
  author_email: "support@example.com",
  author_url: "https://example.com",
  overview_url: "https://example.com/trello",
  privacy_url: "./privacy.html",
  terms_url: "./terms.html",
  icon: { url: "./icon.svg" },
  capabilities: ["card-buttons", "show-settings"]
}, "https://powerup.example.com/app/");
assert.equal(adminConfig.connectorUrl, "https://powerup.example.com/app/connector.html?v=20260719.3");
assert.equal(adminConfig.manifestUrl, "https://powerup.example.com/app/manifest.json");
assert.equal(adminConfig.iconUrl, "https://powerup.example.com/app/icon.svg");
assert.equal(adminConfig.privacyUrl, "https://powerup.example.com/app/privacy.html");
assert.equal(adminConfig.termsUrl, "https://powerup.example.com/app/terms.html");
assert.deepEqual(adminConfig.capabilities, ["card-buttons", "show-settings"]);

const adminValuesText = TrelloAdminConfig.makeAdminValuesText(adminConfig);
assert.ok(adminValuesText.includes("iframe Connector URL: https://powerup.example.com/app/connector.html?v=20260719.3"));
assert.ok(adminValuesText.includes("Manifest URL: https://powerup.example.com/app/manifest.json"));
assert.ok(adminValuesText.includes("Privacy policy URL: https://powerup.example.com/app/privacy.html"));
assert.ok(adminValuesText.includes("Terms of service URL: https://powerup.example.com/app/terms.html"));
assert.ok(adminValuesText.includes("Capabilities: card-buttons, show-settings"));

const adminFieldMap = TrelloAdminConfig.createAdminFieldMap(adminConfig);
assert.ok(adminFieldMap.some((item) => item.key === "connectorUrl" && item.aliases.includes("iframe connector url")));
assert.ok(adminFieldMap.some((item) => item.key === "privacyUrl" && item.aliases.includes("privacy policy url")));
assert.ok(adminFieldMap.some((item) => item.key === "termsUrl" && item.aliases.includes("terms of service url")));
assert.ok(adminFieldMap.some((item) => item.key === "capability:card-buttons" && item.type === "capability"));
assert.ok(adminFieldMap.every((item) => Array.isArray(item.aliases) && item.aliases.length > 0));
assert.equal(adminFieldMap.some((item) => item.key === "overviewUrl" && item.aliases.includes("privacy policy url")), false);

const adminFieldMapText = TrelloAdminConfig.makeAdminFieldMapText(adminConfig);
assert.ok(adminFieldMapText.includes("Trello Power-Up field map"));
assert.ok(adminFieldMapText.includes("Field: iframe Connector URL"));
assert.ok(adminFieldMapText.includes("Field: Privacy policy URL"));
assert.ok(adminFieldMapText.includes("Field: Terms of service URL"));
assert.ok(adminFieldMapText.includes("Capability: card-buttons"));
assert.doesNotMatch(adminFieldMapText, /sk-[a-z0-9]/i);

const adminReadiness = TrelloAdminConfig.createAdminReadinessChecklist(
  adminConfig,
  TrelloAdminConfig.validateHostedBaseUrl("https://powerup.example-host.com/app/")
);
assert.ok(adminReadiness.every((item) => typeof item.key === "string" && typeof item.ok === "boolean"));
assert.ok(adminReadiness.some((item) => item.key === "hosted-base-url" && item.ok));
assert.ok(adminReadiness.some((item) => item.key === "privacy-url" && item.ok));
assert.ok(adminReadiness.some((item) => item.key === "terms-url" && item.ok));
assert.ok(adminReadiness.some((item) => item.key === "manual-save" && item.ok && item.detail.includes("never saves")));

const adminRunbookText = TrelloAdminConfig.makeAdminRunbookText(
  adminConfig,
  TrelloAdminConfig.validateHostedBaseUrl("https://powerup.example-host.com/app/")
);
assert.ok(adminRunbookText.includes("Trello Power-Up admin runbook"));
assert.ok(adminRunbookText.includes("[x] Hosted base URL is public HTTPS"));
assert.ok(adminRunbookText.includes("Save manually in Trello only after review."));
assert.doesNotMatch(adminRunbookText, /sk-[a-z0-9]/i);

const adminSetupPackage = TrelloAdminConfig.createAdminSetupPackage(
  adminConfig,
  TrelloAdminConfig.validateHostedBaseUrl("https://powerup.example-host.com/app/"),
  {
    now: "2026-06-29T12:08:00.000Z",
    deploymentPresetId: "github-pages",
    deploymentPresets: TrelloAdminConfig.createDeploymentPresets({
      githubOwner: "Noodzakelijk-Online",
      githubRepo: "007--Trello-Summarize-This-"
    })
  }
);
assert.equal(adminSetupPackage.schemaVersion, "summarize-this-trello-admin-setup-v1");
assert.equal(adminSetupPackage.generatedAt, "2026-06-29T12:08:00.000Z");
assert.equal(adminSetupPackage.validation.isReadyForTrello, true);
assert.equal(adminSetupPackage.adminValues.connectorUrl, adminConfig.connectorUrl);
assert.equal(adminSetupPackage.adminValues.privacyUrl, adminConfig.privacyUrl);
assert.equal(adminSetupPackage.adminValues.termsUrl, adminConfig.termsUrl);
assert.ok(adminSetupPackage.readinessChecklist.some((item) => item.key === "connector-url" && item.ok));
assert.ok(adminSetupPackage.readinessChecklist.some((item) => item.key === "privacy-url" && item.ok));
assert.ok(adminSetupPackage.adminFieldMap.some((item) => item.key === "connectorUrl"));
assert.ok(adminSetupPackage.adminFieldMap.some((item) => item.key === "privacyUrl"));
assert.equal(adminSetupPackage.deploymentGuide.id, "github-pages");
assert.ok(adminSetupPackage.deploymentGuide.steps.some((item) => item.includes("GitHub Pages")));
assert.ok(adminSetupPackage.safetyNotes.some((item) => item.includes("does not save")));
assert.ok(adminSetupPackage.autofillBookmarklet.startsWith("javascript:"));
assert.equal(JSON.stringify(adminSetupPackage).includes("support@example.com"), true);
assert.doesNotMatch(JSON.stringify(adminSetupPackage), /sk-[a-z0-9]/i);

const adminAutofillScript = TrelloAdminConfig.createAdminAutofillScript(adminConfig);
assert.ok(adminAutofillScript.includes("https://powerup.example.com/app/connector.html?v=20260719.3"));
assert.ok(adminAutofillScript.includes("https://powerup.example.com/app/manifest.json"));
assert.ok(adminAutofillScript.includes("https://powerup.example.com/app/privacy.html"));
assert.ok(adminAutofillScript.includes("https://powerup.example.com/app/terms.html"));
assert.ok(adminAutofillScript.includes("https://trello.com/power-ups/admin"));
assert.ok(adminAutofillScript.includes("config.fields.forEach"));
assert.ok(adminAutofillScript.includes("Missing:"));
assert.ok(adminAutofillScript.includes("Review every field in Trello"));
assert.ok(adminAutofillScript.includes("privacy policy url"));
assert.doesNotMatch(adminAutofillScript, /form\.submit|submit\s*\(/i);
assert.doesNotMatch(adminAutofillScript, /save\s*\(/i);
assert.doesNotThrow(() => new Function(adminAutofillScript));

let autofillBannerText = "";
const autofillFakeDocument = {
  body: {
    appendChild(element) {
      autofillBannerText = element.textContent;
      this.lastChild = element;
    }
  },
  getElementById() {
    return null;
  },
  createElement() {
    const element = {
      style: {},
      set textContent(value) {
        autofillBannerText = value;
      },
      get textContent() {
        return autofillBannerText;
      }
    };
    return element;
  }
};
new Function("document", "location", "Event", "console", adminAutofillScript)(
  autofillFakeDocument,
  { hostname: "example.com", pathname: "/" },
  function Event() {},
  { table() {} }
);
assert.ok(autofillBannerText.includes("only runs on https://trello.com/power-ups/admin"));

const adminBookmarklet = TrelloAdminConfig.createAdminBookmarklet(adminConfig);
assert.ok(adminBookmarklet.startsWith("javascript:"));
assert.ok(adminBookmarklet.length < 9000);

const deploymentPresets = TrelloAdminConfig.createDeploymentPresets({
  githubOwner: "Noodzakelijk-Online",
  githubRepo: "007--Trello-Summarize-This-"
});
assert.deepEqual(deploymentPresets.map((preset) => preset.id), ["github-pages", "netlify", "vercel", "custom"]);
assert.equal(
  deploymentPresets.find((preset) => preset.id === "github-pages").baseUrl,
  "https://noodzakelijk-online.github.io/007--Trello-Summarize-This-"
);
assert.ok(deploymentPresets.find((preset) => preset.id === "netlify").baseUrl.includes(".netlify.app"));
assert.ok(deploymentPresets.find((preset) => preset.id === "vercel").baseUrl.includes(".vercel.app"));

const githubDeploymentGuide = TrelloAdminConfig.createDeploymentGuide(
  "github-pages",
  "https://powerup.example-host.com/app",
  deploymentPresets
);
assert.equal(githubDeploymentGuide.label, "GitHub Pages");
assert.ok(githubDeploymentGuide.actionUrl.includes("/settings/pages"));
assert.ok(githubDeploymentGuide.requiredFiles.includes("connector.js"));
assert.ok(githubDeploymentGuide.requiredFiles.includes("privacy.html"));
assert.ok(githubDeploymentGuide.requiredFiles.includes("terms.html"));
assert.ok(githubDeploymentGuide.verification.some((item) => item.includes("manifest.json")));
assert.ok(githubDeploymentGuide.verification.some((item) => item.includes("privacy.html") && item.includes("terms.html")));
assert.ok(githubDeploymentGuide.resourceNote.includes("No server"));

const deploymentGuideText = TrelloAdminConfig.makeDeploymentGuideText(githubDeploymentGuide);
assert.ok(deploymentGuideText.includes("Summarize This deployment guide"));
assert.ok(deploymentGuideText.includes("Required static files:"));
assert.ok(deploymentGuideText.includes("Resource note:"));
assert.doesNotMatch(deploymentGuideText, /sk-[a-z0-9]/i);

const hostedValidation = TrelloAdminConfig.validateHostedBaseUrl("https://powerup.example-host.com/app/");
assert.equal(hostedValidation.baseUrl, "https://powerup.example-host.com/app");
assert.equal(hostedValidation.isReadyForTrello, true);

const placeholderValidation = TrelloAdminConfig.validateHostedBaseUrl("https://your-hosted-site.example");
assert.equal(placeholderValidation.isReadyForTrello, false);
assert.equal(placeholderValidation.isPlaceholder, true);

const localhostValidation = TrelloAdminConfig.validateHostedBaseUrl("http://localhost:3000");
assert.equal(localhostValidation.isReadyForTrello, false);
assert.equal(localhostValidation.isLocal, true);

const privateIpValidation = TrelloAdminConfig.validateHostedBaseUrl("https://192.168.10.5/");
assert.equal(privateIpValidation.isReadyForTrello, false);
assert.equal(privateIpValidation.isLocal, true);

const privateIpValidationV6 = TrelloAdminConfig.validateHostedBaseUrl("https://[fc00::1]/");
assert.equal(privateIpValidationV6.isReadyForTrello, false);
assert.equal(privateIpValidationV6.isLocal, true);

const fileValidation = TrelloAdminConfig.validateHostedBaseUrl("file:///C:/SummarizeThis/connector.js");
assert.equal(fileValidation.isReadyForTrello, false);

async function runAsyncTests() {
  const previousTrelloConfig = globalThis.SummarizeThisTrelloConfig;
  globalThis.SummarizeThisTrelloConfig = {
    appKey: "trello-app-key-test",
    appName: "Summarize This"
  };

  const metadataOnlyPdf = await trelloSanitizer.processPDF({
    name: "contract.pdf",
    bytes: 2048
  });
  assert.equal(metadataOnlyPdf.processed, false);
  assert.equal(metadataOnlyPdf.extractionStatus, "metadata-only");
  assert.match(metadataOnlyPdf.content, /metadata-only/i);

  const metadataOnlyImage = await trelloSanitizer.processImage({
    name: "diagram.png",
    bytes: 1024
  });
  assert.equal(metadataOnlyImage.processed, false);
  assert.equal(metadataOnlyImage.extractionStatus, "metadata-only");
  assert.match(metadataOnlyImage.content, /metadata-only/i);

  const connectorText = fs.readFileSync(path.join(__dirname, "connector.js"), "utf8");
  let registeredPowerUp = null;
  new Function("TrelloPowerUp", connectorText)({
    initialize(config) {
      registeredPowerUp = config;
    }
  });
  assert.ok(registeredPowerUp, "connector registers Trello Power-Up capabilities");
  assert.equal(registeredPowerUp["card-buttons"]()[0].text, "Summarize This");

  async function connectorStatusFor(settings, options = {}) {
    const cardId = options.cardId || "connector-card";
    const history = options.history || {};
    const fakeT = {
      get(scope, visibility, key) {
        assert.equal(scope, "member");
        assert.equal(visibility, "private");
        if (key === "summarizeThisSettings") return Promise.resolve(settings);
        if (key === "summarizeThisLedgerHistory") return Promise.resolve(history);
        throw new Error(`Unexpected connector storage key: ${key}`);
      },
      card(field) {
        assert.equal(field, "id");
        return Promise.resolve({ id: cardId });
      },
      getRestApi() {
        return {
          getToken() {
            if (options.rejectToken) {
              return Promise.reject(new Error("not authorized"));
            }
            return Promise.resolve(options.token || "");
          }
        };
      }
    };
    const badges = await registeredPowerUp["card-detail-badges"](fakeT);
    const authorization = await registeredPowerUp["authorization-status"](fakeT);
    return {
      badgeText: badges[0].text,
      badgeColor: badges[0].color,
      authorized: authorization.authorized
    };
  }

  assert.deepEqual(await connectorStatusFor({ analysisMode: "local" }), {
    badgeText: "Summary ready",
    badgeColor: "green",
    authorized: false
  });
  assert.deepEqual(await connectorStatusFor({ apiKeys: { openai: "sk-test-value" } }), {
    badgeText: "Summary ready",
    badgeColor: "green",
    authorized: false
  });
  assert.deepEqual(await connectorStatusFor({
    proxy: {
      enabled: true,
      endpoint: "https://proxy.example.com/summarize"
    }
  }), {
    badgeText: "Summary ready",
    badgeColor: "green",
    authorized: false
  });
  assert.deepEqual(await connectorStatusFor({ analysisMode: "local" }, {
    token: "member-token"
  }), {
    badgeText: "Summary ready",
    badgeColor: "green",
    authorized: true
  });
  assert.deepEqual(await connectorStatusFor({ analysisMode: "local" }, {
    history: {
      "connector-card": [{
        status: "completed",
        result: {
          confidence: {
            overall: 84,
            reviewNeeded: false
          }
        }
      }]
    },
    token: "member-token"
  }), {
    badgeText: "84% confidence",
    badgeColor: "green",
    authorized: true
  });
  assert.deepEqual(await connectorStatusFor({ analysisMode: "local" }, {
    history: {
      "connector-card": [{
        status: "completed",
        result: {
          confidence: {
            overall: 49,
            reviewNeeded: true
          }
        }
      }]
    },
    token: "member-token"
  }), {
    badgeText: "Review needed",
    badgeColor: "yellow",
    authorized: true
  });
  assert.deepEqual(await connectorStatusFor({ analysisMode: "local" }, {
    history: {
      "connector-card": [{
        status: "failed",
        result: {
          confidence: {
            overall: 0,
            reviewNeeded: true
          }
        }
      }]
    },
    token: "member-token"
  }), {
    badgeText: "Analysis failed",
    badgeColor: "red",
    authorized: true
  });
  assert.deepEqual(await connectorStatusFor({ proxy: { enabled: true } }), {
    badgeText: "Setup needed",
    badgeColor: "yellow",
    authorized: false
  });

  const previousConfig = globalThis.SummarizeThisTrelloConfig;
  globalThis.SummarizeThisTrelloConfig = {
    appKey: "",
    appName: "Summarize This"
  };
  assert.deepEqual(await connectorStatusFor({ analysisMode: "local" }, {
    token: "member-token"
  }), {
    badgeText: "Summary ready",
    badgeColor: "green",
    authorized: false
  });
  globalThis.SummarizeThisTrelloConfig = previousConfig;

  const connectorHtmlText = fs.readFileSync(path.join(__dirname, "connector.html"), "utf8");
  assert.match(connectorHtmlText, /trello-config\.js/);
  const authorizeText = fs.readFileSync(path.join(__dirname, "authorize.html"), "utf8");
  assert.match(authorizeText, /trello-config\.js/);
  assert.doesNotMatch(authorizeText, /api\.trello\.com\/1\/client\.js\?key=87f50d5376d860dfac3dfbb42f5c7e79/);
  assert.match(authorizeText, /loadAuthorizationClient/);
  assert.match(authorizeText, /Add your Trello app key in trello-config\.js first/);
  assert.doesNotMatch(connectorText, /87f50d5376d860dfac3dfbb42f5c7e79/);

  const trelloSourceRead = new TrelloIntegration();
  trelloSourceRead.isInTrello = true;
  trelloSourceRead.t = {
    card: async function () {
      return {
        id: "card-source-read",
        name: "Source-read regression",
        desc: "Verify partial Trello failures are visible.",
        labels: [{ name: "Ops" }],
        members: [],
        due: null,
        dueComplete: false,
        url: "https://trello.example/c/source-read",
        shortUrl: "https://trello.example/c/src",
        badges: {
          comments: 4,
          attachments: 1,
          checkItems: 2
        },
        attachments: [{ id: "att-1", name: "notes.txt", url: "https://files.example/notes.txt" }],
        checklists: [{ id: "check-1", checkItems: [{ state: "complete" }, { state: "incomplete" }] }],
        customFieldItems: [{ id: "custom-1" }]
      };
    },
    member: async function () {
      return [{ fullName: "Context Member" }];
    },
    board: async function () {
      throw new Error("Board read failed token=board-secret https://trello.example/private-board");
    },
    list: async function () {
      return { name: "Doing" };
    },
    getRestApi: function () {
      return {
        getCardActions: async function () {
          throw new Error("Authorization: Bearer comment-secret token=comment-secret https://attachments.example.com/private");
        }
      };
    }
  };
  const previousWarn = console.warn;
  console.warn = function () {};
  try {
    const trelloCardData = await trelloSourceRead.getCardData();
    assert.deepEqual(trelloCardData.members, ["Context Member"]);
    assert.equal(trelloCardData.list, "Doing");
    assert.equal(trelloCardData.board, "");
    assert.equal(trelloCardData.comments.length, 0);
    assert.equal(trelloCardData.__sourceCounts.comments, 4);
    assert.equal(trelloCardData.__sourceCounts.attachments, 1);
    assert.equal(trelloCardData.__sourceCounts.checklistItems, 2);
    assert.equal(trelloCardData.__sourceStatus.list.ok, true);
    assert.equal(trelloCardData.__sourceStatus.board.ok, false);
    assert.equal(trelloCardData.__sourceStatus.comments.ok, false);
    assert.doesNotMatch(trelloCardData.__sourceStatus.board.error, /board-secret|trello\.example/);
    assert.doesNotMatch(trelloCardData.__sourceStatus.comments.error, /comment-secret|attachments\.example\.com/);
  } finally {
    console.warn = previousWarn;
  }

  const ProxyWorker = await import(pathToFileURL(path.join(__dirname, "proxy", "cloudflare-worker.mjs")).href);
  assert.equal(ProxyWorker.selectProvider("auto", {
    DEFAULT_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-proxy-openai"
  }), "openai");
  assert.equal(ProxyWorker.resolveAllowedOrigin("https://powerup.example", {
    ALLOWED_ORIGINS: "https://powerup.example,https://other.example"
  }), "https://powerup.example");
  assert.equal(ProxyWorker.resolveAllowedOrigin("https://evil.example", {
    ALLOWED_ORIGINS: "https://powerup.example"
  }), "");
  assert.throws(() => ProxyWorker.normalizeProxyRequest({
    schemaVersion: "summarize-this-ai-proxy-request-v1",
    provider: "openai",
    prompt: "x".repeat(24001)
  }), /Prompt is too large/);
  const normalizedProxyBudget = ProxyWorker.normalizeProxyRequest({
    schemaVersion: "summarize-this-ai-proxy-request-v1",
    provider: "openai",
    prompt: "Return JSON.",
    maxOutputTokens: "1200"
  });
  assert.equal(normalizedProxyBudget.maxOutputTokens, 1200);
  assert.equal(ProxyWorker.normalizeProxyRequest({
    schemaVersion: "summarize-this-ai-proxy-request-v1",
    provider: "openai",
    prompt: "Return JSON.",
    maxOutputTokens: "99999"
  }).maxOutputTokens, 2000);
  ProxyWorker.resetRateLimitBuckets();
  const rateLimitRequest = new Request("https://proxy.example.test/", {
    headers: {
      "Origin": "https://powerup.example",
      "CF-Connecting-IP": "203.0.113.10"
    }
  });
  const firstRateLimit = ProxyWorker.checkRateLimit(
    rateLimitRequest,
    { RATE_LIMIT_PER_MINUTE: "1" },
    "https://powerup.example",
    Date.parse("2026-06-29T12:00:00.000Z")
  );
  const secondRateLimit = ProxyWorker.checkRateLimit(
    rateLimitRequest,
    { RATE_LIMIT_PER_MINUTE: "1" },
    "https://powerup.example",
    Date.parse("2026-06-29T12:00:01.000Z")
  );
  assert.equal(firstRateLimit.allowed, true);
  assert.equal(firstRateLimit.headers["RateLimit-Limit"], "1");
  assert.equal(firstRateLimit.headers["RateLimit-Remaining"], "0");
  assert.equal(secondRateLimit.allowed, false);
  assert.equal(secondRateLimit.headers["Retry-After"], "59");
  ProxyWorker.resetRateLimitBuckets();

  const blockedProxyResponse = await ProxyWorker.handleRequest(new Request("https://proxy.example.test/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://evil.example"
    },
    body: JSON.stringify({
      schemaVersion: "summarize-this-ai-proxy-request-v1",
      provider: "openai",
      prompt: "Return JSON."
    })
  }), {
    ALLOWED_ORIGINS: "https://powerup.example",
    OPENAI_API_KEY: "sk-proxy-openai"
  }, {
    waitUntil() {}
  });
  assert.equal(blockedProxyResponse.status, 403);

  const originalProxyFetch = global.fetch;
  let providerCall = null;
  global.fetch = async function (url, options) {
    providerCall = { url, options };
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            about: "Proxy generated summary.",
            history: "Provider call completed.",
            currentStatus: "Ready for review.",
            nextSteps: ["Review the proxy summary."],
            blockers: [],
            robertDecisions: [],
            vaReadyActions: [],
            evidenceClaims: [],
            validationFindings: []
          })
        }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  try {
    const proxyResponse = await ProxyWorker.handleRequest(new Request("https://proxy.example.test/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://powerup.example"
      },
      body: JSON.stringify({
        schemaVersion: "summarize-this-ai-proxy-request-v1",
        provider: "openai",
        model: "gpt-4o-mini",
        strategy: "cost-effective",
        outputMode: "operational-ledger",
        outputLanguage: "en",
        maxOutputTokens: 1200,
        prompt: "Return JSON."
      })
    }), {
      ALLOWED_ORIGINS: "https://powerup.example",
      OPENAI_API_KEY: "sk-proxy-secret-openai"
    }, {
      waitUntil(promise) {
        return promise;
      }
    });

    const proxyBody = await proxyResponse.json();
    assert.equal(proxyResponse.status, 200);
    assert.equal(proxyResponse.headers.get("Access-Control-Allow-Origin"), "https://powerup.example");
    assert.equal(proxyBody.summary.about, "Proxy generated summary.");
    assert.equal(proxyBody.metadata.provider, "OpenAI via proxy");
    assert.equal(proxyBody.metadata.tokens, 150);
    assert.equal(proxyBody.metadata.cost, null);
    assert.equal(proxyBody.metadata.costEstimated, false);
    assert.equal(providerCall.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(JSON.parse(providerCall.options.body).max_completion_tokens, 1200);
    assert.match(providerCall.options.headers.Authorization, /sk-proxy-secret-openai/);
    assert.doesNotMatch(JSON.stringify(proxyBody), /sk-proxy-secret-openai/);
  } finally {
    global.fetch = originalProxyFetch;
  }

  const provider = new AIProviders();
  const providerCardData = {
    name: "Provider test card",
    desc: "Test card for provider hardening.",
    labels: ["Test"],
    members: ["Alice"],
    comments: [{ text: "First comment." }],
    due: "2026-06-30T00:00:00.000Z",
    checklistProgress: "1/3"
  };

  const providerCalls = [];
  global.fetch = async function (url, options) {
    providerCalls.push({
      url: String(url),
      headers: options.headers || {},
      body: JSON.parse(String(options.body || "{}"))
    });

    if (String(url).includes("api.openai.com")) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              about: "Summary",
              history: "No history.",
              status: "Needs work",
              nextSteps: ["Review"],
              insights: []
            })
          }
        }],
        usage: { total_tokens: 12 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (String(url).includes("api.anthropic.com")) {
      return new Response(JSON.stringify({
        content: [{ text: "{\"about\":\"Summary\",\"history\":\"No history.\",\"status\":\"Needs work\",\"nextSteps\":[\"Review\"],\"insights\":[]}" }],
        usage: { input_tokens: 40, output_tokens: 20 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "{\"about\":\"Summary\",\"history\":\"No history.\",\"status\":\"Needs work\",\"nextSteps\":[\"Review\"],\"insights\":[]}" }] } }],
        usageMetadata: { totalTokenCount: 75 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (String(url).includes("api.cohere.ai")) {
      return new Response(JSON.stringify({
        generations: [{ text: "{\"about\":\"Summary\",\"history\":\"No history.\",\"status\":\"Needs work\",\"nextSteps\":[\"Review\"],\"insights\":[]}" }],
        meta: { billed_units: { output_tokens: 10 } }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      choices: [{ message: { content: "{\"about\":\"Summary\",\"history\":\"No history.\",\"status\":\"Needs work\",\"nextSteps\":[\"Review\"],\"insights\":[]}" } }],
      usage: { total_tokens: 12 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  provider.setApiKey("openai", "sk-test-openai-hardening");
  await provider.callOpenAI("gpt-4o-mini", "", providerCardData);
  assert.equal(providerCalls[providerCalls.length - 1].body.max_completion_tokens, provider.maxOutputTokens);

  provider.setApiKey("anthropic", "sk-test-anthropic-hardening");
  await provider.callAnthropic("claude-3-haiku-20240307", "", providerCardData);
  assert.equal(providerCalls[providerCalls.length - 1].body.max_tokens, provider.maxOutputTokens);

  provider.setApiKey("google", "google-test-hardening");
  await provider.callGoogle("gemini-1.5-flash", "", providerCardData);
  assert.equal(providerCalls[providerCalls.length - 1].body.generationConfig.maxOutputTokens, provider.maxOutputTokens);

  provider.setApiKey("cohere", "bearer-test-cohere");
  await provider.callCohere("command-r", "", providerCardData);
  assert.equal(providerCalls[providerCalls.length - 1].body.max_tokens, provider.maxOutputTokens);

  provider.setApiKey("perplexity", "ppx-test-perplexity");
  await provider.callPerplexity("llama-3-8b", "", providerCardData);
  assert.equal(providerCalls[providerCalls.length - 1].body.max_tokens, provider.maxOutputTokens);

  const timeoutProvider = new AIProviders();
  global.fetch = async function (_url, options) {
    return new Promise((_resolve, reject) => {
      options.signal && options.signal.addEventListener("abort", function handleAbort() {
        const abortError = new Error("Request aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });
  };

  try {
    await timeoutProvider.fetchWithTimeout("https://example.com/slow", {}, 8);
    throw new Error("Expected timeout error");
  } catch (error) {
    assert.equal(error.message, "AI provider request timed out");
  } finally {
    global.fetch = originalProxyFetch;
  }

  provider.setApiKey("openai", "sk-test-openai-validate");
  global.fetch = async function () {
    return new Response(JSON.stringify({
      error: {
        message: "Invalid API key sk-openai-validation-secret"
      }
    }), {
      status: 401,
      statusText: "Unauthorized",
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  try {
    const openaiValidation = await provider.validateApiKey("openai");
    assert.equal(openaiValidation.valid, false);
    assert.doesNotMatch(openaiValidation.error, /sk-test-openai-validate|sk-openai-validation-secret/);
    assert.match(openaiValidation.error, /Invalid API key/);
  } finally {
    global.fetch = originalProxyFetch;
  }

  const processor = new AttachmentProcessor();
  assert.equal(processor.isTextLikeAttachment({ name: "notes.txt", mimeType: "text/plain" }), true);
  assert.equal(processor.isTextLikeAttachment({ name: "invoice.pdf", mimeType: "application/pdf" }), false);
  assert.equal(processor.isSafeExtractableAttachment({ name: "invoice.pdf", mimeType: "application/pdf" }), true);

  const originalFetch = global.fetch;
  global.fetch = async function (url, options) {
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    if (url === "https://attachments.example.com/invoice.pdf") {
      return {
        ok: true,
        blob: async function () {
          const pdfText = "%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT\n(Invoice total 1450 due Friday) Tj\nET\nendstream\nendobj\n%%EOF";
          return new Blob([pdfText], { type: "application/pdf" });
        }
      };
    }
    assert.equal(url, "https://attachments.example.com/notes.txt");
    return {
      ok: true,
      blob: async function () {
        return new Blob(["Line one\n" + "detail ".repeat(120)], { type: "text/plain" });
      }
    };
  };

  try {
    const processed = await processor.processSafeTextAttachments([
      {
        id: "att-text",
        name: "notes.txt",
        mimeType: "text/plain",
        url: "https://attachments.example.com/notes.txt",
        bytes: 32
      },
      {
        id: "att-pdf",
        name: "invoice.pdf",
        mimeType: "application/pdf",
        url: "https://attachments.example.com/invoice.pdf",
        bytes: 1200
      }
    ], {
      maxAttachments: 2,
      maxBytes: 1000,
      maxExtractedCharacters: 500,
      timeoutMs: 1000
    });

    assert.equal(processed.status.extracted, 2);
    assert.equal(processed.status.failed, 0);
    assert.equal(processed.attachments[0].processed, true);
    assert.equal(processed.attachments[0].extractionStatus, "truncated");
    assert.equal(processed.attachments[0].extractedText.length, 500);
    assert.equal(processed.attachments[0].metadata.truncated, true);
    assert.equal(processed.attachments[1].processed, true);
    assert.equal(processed.attachments[1].extractionStatus, "pdf-text-extracted");
    assert.match(processed.attachments[1].extractedText, /Invoice total 1450 due Friday/);

    const extractedCard = Object.assign({}, sample, {
      attachments: processed.attachments
    });
    const promptWithAttachmentText = JSON.parse(SummarizeThis.buildAIPrompt(extractedCard).slice(SummarizeThis.buildAIPrompt(extractedCard).lastIndexOf("\n{") + 1));
    assert.ok(promptWithAttachmentText.attachments.some(item => item.name === "notes.txt" && item.textPreview.includes("Line one")));
    assert.ok(promptWithAttachmentText.attachments.some(item => item.name === "invoice.pdf" && item.textPreview.includes("Invoice total 1450 due Friday")));
    const extractedRun = CardIntelligenceLedger.createAnalysisRun(extractedCard, local);
    assert.ok(extractedRun.result.evidence.some(item => item.type === "attachment" && item.excerpt.includes("Line one")));
    assert.ok(extractedRun.result.evidence.some(item => item.type === "attachment" && item.excerpt.includes("Invoice total 1450 due Friday")));
    const extractedFacts = CardIntelligenceLedger.createAttachmentFacts(extractedCard);
    assert.equal(extractedFacts.extracted, 2);
    assert.equal(extractedFacts.metadataOnly, 0);
    assert.ok(extractedFacts.facts.some(item => item.name === "notes.txt" && item.detail.includes("Line one")));
    assert.ok(extractedFacts.facts.some(item => item.name === "invoice.pdf" && item.detail.includes("Invoice total 1450 due Friday")));
  } finally {
    global.fetch = originalFetch;
    globalThis.SummarizeThisTrelloConfig = previousTrelloConfig;
  }

  assert.throws(() => processor.validateAttachmentUrl("https://2130706433/private.txt"), /Private or local/);
  assert.throws(() => processor.validateAttachmentUrl("https://[fc00::1]/private.txt"), /Private or local/);

  let legacyFetchCount = 0;
  global.fetch = async function (url, options) {
    legacyFetchCount += 1;
    assert.equal(url, "https://attachments.example.com/notes.txt");
    assert.equal(options.credentials, "omit");
    return {
      ok: true,
      blob: async function () {
        return new Blob(["Safe legacy text"], { type: "text/plain" });
      }
    };
  };

  try {
    const legacyProcessed = await processor.processAttachments([
      {
        id: "legacy-pdf",
        name: "contract.pdf",
        mimeType: "application/pdf",
        url: "https://attachments.example.com/contract.pdf",
        bytes: 4000000
      },
      {
        id: "legacy-text",
        name: "notes.txt",
        mimeType: "text/plain",
        url: "https://attachments.example.com/notes.txt",
        bytes: 16
      }
    ]);

    assert.equal(legacyFetchCount, 1);
    assert.equal(legacyProcessed[0].extractionStatus, "metadata-only-binary");
    assert.equal(legacyProcessed[0].processed, false);
    assert.equal(legacyProcessed[1].extractionStatus, "text-extracted");
    assert.equal(legacyProcessed[1].extractedText, "Safe legacy text");
  } finally {
    global.fetch = originalFetch;
  }
}

runAsyncTests()
  .then(() => {
    console.log("All summarizer tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
