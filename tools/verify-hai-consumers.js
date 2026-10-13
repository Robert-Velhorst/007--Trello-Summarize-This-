"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const backendPath = process.argv[2];
if (!backendPath) {
  console.error("Usage: node tools/verify-hai-consumers.js <HAI backend directory>");
  process.exit(1);
}
const sourceFiles = {
  "generic_feed.go": "internal/accountfeed/generic_feed.go",
  "enum.go": "internal/accountfeed/enum.go",
  "bridge.go": "internal/accountfeed/bridge.go",
  "service.go": "internal/source/service.go"
};
const temporaryRoot = path.resolve(os.tmpdir());
const directory = fs.mkdtempSync(path.join(temporaryRoot, "summarize-this-hai-contract-"));
const containerName = path.basename(directory).toLowerCase();
let containerAttempted = false;
try {
  const hashes = {};
  fs.mkdirSync(path.join(directory, "sources"));
  for (const [name, relativePath] of Object.entries(sourceFiles)) {
    const source = fs.readFileSync(path.join(path.resolve(backendPath), relativePath));
    hashes[relativePath] = crypto.createHash("sha256").update(source).digest("hex");
    fs.writeFileSync(path.join(directory, "sources", name), source);
  }
  for (const file of ["extract.go", "consumer-check.go.txt"]) {
    fs.copyFileSync(path.join(__dirname, "hai-consumer-contract", file), path.join(directory, file));
  }
  execFileSync(process.execPath, [path.join(__dirname, "..", "e2e.test.js")], {
    env: { ...process.env, TEST_DATABASE_URL: "", HAI_CONTRACT_FIXTURE_DIR: directory },
    stdio: "inherit", timeout: 60_000
  });
  containerAttempted = true;
  execFileSync("docker", [
    "run", "--rm", "--pull", "never", "--name", containerName, "--label", `summarize-this-contract=${containerName}`,
    "--network", "none", "--read-only", "--cpus", "1", "--memory", "512m", "--pids-limit", "256",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--tmpfs", "/tmp:rw,exec,size=256m", "--mount", `type=bind,source=${directory},target=/probe,readonly`,
    "--workdir", "/tmp", "--env", "GOCACHE=/tmp/go-cache", "--env", "GO111MODULE=off",
    "--env", "GOPROXY=off", "--env", "GOSUMDB=off",
    "golang:1.25.13", "go", "run", "/probe/extract.go"
  ], { stdio: "inherit", timeout: 180_000 });
  console.log(JSON.stringify({
    scope: "Actual HAI account-feed parser and Connected Sources JSON types; not live HAI ingestion, normalization, database writes, or operation execution",
    sourceSha256: hashes
  }, null, 2));
} finally {
  if (containerAttempted) {
    let container;
    try {
      container = JSON.parse(execFileSync("docker", ["inspect", containerName], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }))[0];
    } catch (_) {
      // A completed --rm container has already been removed.
    }
    if (container) {
      if (container.Config.Labels["summarize-this-contract"] !== containerName) throw new Error("Refusing to stop an unowned container");
      execFileSync("docker", ["stop", "--time", "5", containerName], { stdio: "ignore", timeout: 15_000 });
    }
  }
  if (path.dirname(path.resolve(directory)) !== temporaryRoot || !path.basename(directory).startsWith("summarize-this-hai-contract-")) {
    throw new Error("Refusing cleanup outside the owned temporary directory");
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
