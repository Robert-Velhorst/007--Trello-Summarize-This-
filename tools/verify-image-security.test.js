"use strict";

const assert = require("node:assert/strict");
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
