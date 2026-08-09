const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;

function read(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), "utf8");
}

function exists(fileName) {
  return fs.existsSync(path.join(ROOT, fileName));
}

const checks = [];

function addCheck(label, ok, detail) {
  checks.push({ label, ok, detail });
}

[
  "connector.html",
  "connector.js",
  "popup.html",
  "settings-powerup.html",
  "authorize.html",
  "trello-config.js",
  "manifest.json",
  "backend-config.js",
  "backend-app.js",
  "backend-server.js",
  "backend-storage.js",
  "backend-migrations.js",
  "backend-worker.js",
  "backend-lock.js",
  "backend-support.js",
  "backend-cli.js",
  "backend-doctor.js",
  "Dockerfile",
  "docker-compose.yml",
  "database/connection.js",
  "middleware/errorHandler.js"
].forEach((fileName) => {
  addCheck(`${fileName} exists`, exists(fileName), fileName);
});

const trelloConfigText = exists("trello-config.js") ? read("trello-config.js") : "";
addCheck(
  "Shared Trello config is defined",
  /SummarizeThisTrelloConfig/.test(trelloConfigText),
  "trello-config.js should expose window/globalThis.SummarizeThisTrelloConfig"
);

const connectorHtml = exists("connector.html") ? read("connector.html") : "";
addCheck(
  "Connector loads shared Trello config",
  /trello-config\.js/.test(connectorHtml),
  "connector.html should load trello-config.js before connector.js"
);

const popupText = exists("popup.html") ? read("popup.html") : "";
addCheck(
  "Popup loads shared Trello config",
  /trello-config\.js/.test(popupText),
  "popup.html should load trello-config.js"
);
addCheck(
  "Popup uses shared iframe options",
  /trelloIframeOptions/.test(popupText),
  "popup.html should derive iframe config from trello-config.js"
);

const authorizeText = exists("authorize.html") ? read("authorize.html") : "";
addCheck(
  "Authorize flow loads shared Trello config",
  /trello-config\.js/.test(authorizeText),
  "authorize.html should load trello-config.js"
);
addCheck(
  "Authorize flow uses dynamic Trello client loading",
  /loadAuthorizationClient/.test(authorizeText),
  "authorize.html should load Trello client.js after reading the shared app key"
);

const manifestText = exists("manifest.json") ? read("manifest.json") : "";
addCheck(
  "Manifest points to connector.html",
  /"url": "\.\/connector\.html"/.test(manifestText),
  "manifest.json should use connector.html as the iframe connector"
);

const packageText = exists("package.json") ? read("package.json") : "{}";
addCheck(
  "Package exposes backend scripts",
  /"start:backend"\s*:\s*"node backend-server\.js"/.test(packageText) &&
    /"doctor:backend"\s*:\s*"node backend-doctor\.js"/.test(packageText) &&
    /"test:operations"/.test(packageText) &&
    /"test:e2e"/.test(packageText) &&
    /"build:windows-installer"/.test(packageText),
  "package.json should expose backend, operations, E2E, and installer scripts"
);

const backendServerText = exists("backend-server.js") ? read("backend-server.js") : "";
addCheck(
  "Backend server fails fast on missing env",
  /Missing required environment variables/.test(backendServerText),
  "backend-server.js should stop startup clearly when required env is absent"
);

const backendAppText = exists("backend-app.js") ? read("backend-app.js") : "";
addCheck(
  "Backend health and readiness endpoints exist",
  /\/api\/health/.test(backendAppText) && /\/api\/readiness/.test(backendAppText),
  "backend-app.js should expose /api/health and /api/readiness"
);
addCheck(
  "Backend operations endpoints exist",
  /\/api\/admin\/backup\/create/.test(backendAppText) &&
    /\/api\/admin\/data\/reconcile/.test(backendAppText) &&
    /\/api\/admin\/support-bundle/.test(backendAppText),
  "backend-app.js should expose backup, reconciliation, and support operations"
);

// Node.js version check
const nodeVersion = process.versions.node.split(".").map(Number);
addCheck(
  "Node.js version >= 18",
  nodeVersion[0] >= 18,
  `Current: ${process.version}`
);

// Core module loading check
const coreModules = [
  "summarizer-core",
  "card-intelligence-ledger",
  "attachment-processor",
  "ai-providers",
  "trello-integration"
];
coreModules.forEach((moduleName) => {
  let loadOk = false;
  try {
    require(`./${moduleName}`);
    loadOk = true;
  } catch (_error) {
    loadOk = false;
  }
  addCheck(`Core module ${moduleName} loads`, loadOk, moduleName);
});

// Docs directory
addCheck(
  "docs/ directory exists",
  exists("docs") && fs.statSync(path.join(ROOT, "docs")).isDirectory(),
  "Required audit and verification documents should live under docs/"
);

const failures = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  const mark = check.ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${check.label}${check.detail ? ` - ${check.detail}` : ""}`);
});

if (failures.length) {
  console.error(`Doctor found ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Doctor checks passed (${checks.length} checks).`);
