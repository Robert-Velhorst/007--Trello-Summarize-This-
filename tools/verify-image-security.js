"use strict";

const fs = require("node:fs");
const path = require("node:path");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
function reject(code) { throw new Error(`Image security report rejected: ${code}`); }

function validateImageReport(report, expectedDependencies) {
  if (!object(report) || report.SchemaVersion !== 2 || report.ArtifactType !== "container_image"
    || !object(report.Metadata) || !object(report.Metadata.OS) || report.Metadata.OS.Family !== "alpine"
    || !text(report.Metadata.OS.Name) || (Object.hasOwn(report.Metadata.OS, "EOSL") && report.Metadata.OS.EOSL !== false)
    || !Array.isArray(report.Results) || !report.Results.length) reject("INVALID_REPORT");
  let osResults = 0;
  let packageCount = 0;
  const nodePackages = new Set();
  for (const result of report.Results) {
    if (!object(result) || !text(result.Target) || !Array.isArray(result.Packages) || !result.Packages.length
      || !["os-pkgs", "lang-pkgs"].includes(result.Class)) reject("MISSING_INVENTORY");
    if (result.Class === "os-pkgs") {
      if (result.Type !== "alpine") reject("INVALID_OS_INVENTORY");
      osResults++;
    }
    if (Object.hasOwn(result, "Vulnerabilities") && (!Array.isArray(result.Vulnerabilities) || result.Vulnerabilities.length)) reject("VULNERABILITIES_PRESENT");
    if (Object.hasOwn(result, "ExperimentalModifiedFindings")
      && (!Array.isArray(result.ExperimentalModifiedFindings) || result.ExperimentalModifiedFindings.length)) reject("SUPPRESSED_FINDINGS");
    for (const pkg of result.Packages) {
      if (!object(pkg) || !text(pkg.Name) || !text(pkg.Version)) reject("INVALID_PACKAGE");
      packageCount++;
      if (result.Class === "lang-pkgs" && result.Type === "node-pkg") nodePackages.add(`${pkg.Name}@${pkg.Version}`);
    }
  }
  if (!osResults) reject("MISSING_OS_INVENTORY");
  for (const [name, version] of Object.entries(expectedDependencies)) {
    if (!text(version) || !nodePackages.has(`${name}@${version}`)) reject("MISSING_RUNTIME_DEPENDENCY");
  }
  return { passed: true, resultCount: report.Results.length, packageCount, vulnerabilities: 0 };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 2) reject("UNEXPECTED_ARGUMENT");
    const root = path.resolve(__dirname, "..");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const expected = Object.fromEntries(Object.keys(manifest.dependencies || {}).map(name => [name, lock.packages?.[`node_modules/${name}`]?.version]));
    const reportPath = path.join(root, "artifacts", "image-security.json");
    console.log(JSON.stringify(validateImageReport(JSON.parse(fs.readFileSync(reportPath, "utf8")), expected)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateImageReport };
