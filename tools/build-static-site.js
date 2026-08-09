"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const runtimeFiles = require("../runtime-files.json");

function validateRuntimeFile(file) {
  if (typeof file !== "string" || !file || path.isAbsolute(file)) {
    throw new Error(`Invalid runtime file entry: ${String(file)}`);
  }
  const normalized = path.normalize(file);
  if (normalized.startsWith(`..${path.sep}`) || normalized === "..") {
    throw new Error(`Runtime file escapes the repository: ${file}`);
  }
  const source = path.join(repoRoot, normalized);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Runtime entry must be a regular file: ${file}`);
  }
  return { normalized, source };
}

function buildStaticSite(outputDirectory = path.join(repoRoot, "dist", "static-site")) {
  if (new Set(runtimeFiles).size !== runtimeFiles.length) {
    throw new Error("runtime-files.json contains duplicate entries.");
  }
  const resolvedOutput = path.resolve(outputDirectory);
  if (resolvedOutput === repoRoot || !resolvedOutput.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error("Static output must stay inside the repository.");
  }

  fs.rmSync(resolvedOutput, { recursive: true, force: true });
  fs.mkdirSync(resolvedOutput, { recursive: true });
  for (const file of runtimeFiles) {
    const { normalized, source } = validateRuntimeFile(file);
    const destination = path.join(resolvedOutput, normalized);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  const packageMetadata = require("../package.json");
  fs.writeFileSync(path.join(resolvedOutput, ".nojekyll"), "", "utf8");
  fs.writeFileSync(path.join(resolvedOutput, "deployment.json"), JSON.stringify({
    version: packageMetadata.version,
    revision: String(process.env.GITHUB_SHA || "local").slice(0, 40)
  }, null, 2) + "\n", "utf8");

  return { outputDirectory: resolvedOutput, files: runtimeFiles.slice() };
}

if (require.main === module) {
  const result = buildStaticSite(process.argv[2]);
  console.log(`Built ${result.files.length} runtime files in ${result.outputDirectory}`);
}

module.exports = { buildStaticSite, runtimeFiles, validateRuntimeFile };
