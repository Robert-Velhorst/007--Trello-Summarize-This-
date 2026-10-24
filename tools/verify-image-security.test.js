"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateImageReport } = require("./verify-image-security");
const expected = { pg: "8.23.1" };
function clean() {
  return { SchemaVersion: 2, ArtifactType: "container_image", Metadata: { OS: { Family: "alpine", Name: "3.24.3" } }, Results: [
    { Target: "fixture (alpine)", Class: "os-pkgs", Type: "alpine", Packages: [{ Name: "musl", Version: "1.2.6-r3" }] },
    { Target: "Node.js", Class: "lang-pkgs", Type: "node-pkg", Packages: [{ Name: "pg", Version: "8.23.1" }], Vulnerabilities: [] }
  ] };
}
assert.equal(validateImageReport(clean(), expected).passed, true);
const mutations = [
  report => { report.SchemaVersion = 1; },
  report => { report.ArtifactType = "filesystem"; },
  report => { report.Metadata.OS.EOSL = true; },
  report => { report.Metadata.OS.EOSL = "false"; },
  report => { delete report.Metadata.OS.Name; },
  report => { report.Results = []; },
  report => { report.Results.shift(); },
  report => { report.Results[0].Packages = []; },
  report => { report.Results[0].Packages = [null]; },
  report => { report.Results[0].Type = "debian"; },
  report => { report.Results[1].Packages[0].Version = "8.0.0"; },
  report => { report.Results[1].Vulnerabilities = null; },
  report => { report.Results[1].Vulnerabilities = [{ Severity: "UNKNOWN" }]; },
  report => { report.Results[1].Vulnerabilities = [{ Severity: "LOW" }]; },
  report => { report.Results[1].Vulnerabilities = [{ Severity: "MEDIUM" }]; },
  report => { report.Results[1].Vulnerabilities = [{ Severity: "HIGH" }]; },
  report => { report.Results[1].Vulnerabilities = [{ Severity: "CRITICAL" }]; },
  report => { report.Results[1].ExperimentalModifiedFindings = [{}]; },
  report => { report.Results[1].ExperimentalModifiedFindings = null; },
];
for (const mutate of mutations) {
  const report = clean(); mutate(report);
  assert.throws(() => validateImageReport(report, expected), /Image security report rejected:/);
}
assert.throws(() => validateImageReport(clean(), { pg: undefined }), /MISSING_RUNTIME_DEPENDENCY/);
console.log("Image security policy: clean report accepted; 20 malformed, incomplete or vulnerable reports rejected.");

const temporaryRoot = path.resolve(os.tmpdir());
const directory = fs.mkdtempSync(path.join(temporaryRoot, "summarize-image-policy-"));
const script = path.join(directory, "tools", "verify-image-security.js");
const fixedReport = path.join(directory, "artifacts", "image-security.json");
const outsideReport = path.join(directory, "outside.json");
try {
  fs.mkdirSync(path.dirname(script));
  fs.mkdirSync(path.dirname(fixedReport));
  fs.copyFileSync(path.join(__dirname, "verify-image-security.js"), script);
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ dependencies: expected }));
  fs.writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify({ packages: { "node_modules/pg": { version: "8.23.1" } } }));
  fs.writeFileSync(fixedReport, JSON.stringify(clean()));
  fs.writeFileSync(outsideReport, JSON.stringify(clean()));
  const accepted = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 10000 });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).passed, true);
  const forbidden = spawnSync(process.execPath, [script, outsideReport], { encoding: "utf8", timeout: 10000 });
  assert.equal(forbidden.status, 1);
  assert.match(forbidden.stderr, /UNEXPECTED_ARGUMENT/);
  const bad = clean(); bad.Results[1].Vulnerabilities = [{ Severity: "MEDIUM" }];
  fs.writeFileSync(fixedReport, JSON.stringify(bad));
  const rejected = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 10000 });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /VULNERABILITIES_PRESENT/);
  console.log("Image security CLI: fixed clean report accepted, arbitrary path and vulnerable report rejected.");
} finally {
  assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
  for (const file of [script, fixedReport, outsideReport, path.join(directory, "package.json"), path.join(directory, "package-lock.json")]) fs.unlinkSync(file);
  fs.rmdirSync(path.dirname(script));
  fs.rmdirSync(path.dirname(fixedReport));
  fs.rmdirSync(directory);
}
