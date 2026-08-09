"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildStaticSite, runtimeFiles } = require("./tools/build-static-site");

const repoRoot = __dirname;
const output = path.join(repoRoot, ".tmp", `static-site-test-${process.pid}`);

try {
  const result = buildStaticSite(output);
  assert.equal(result.files.length, runtimeFiles.length);
  assert.ok(runtimeFiles.includes("trello-config.js"), "shared Trello config is packaged");
  assert.ok(runtimeFiles.includes("authorize.html"), "Trello authorization page is packaged");
  assert.ok(!runtimeFiles.includes("trello-runtime-config.js"), "obsolete duplicate Trello config is not packaged");

  for (const file of runtimeFiles) {
    assert.ok(fs.statSync(path.join(output, file)).isFile(), `${file} exists in static output`);
  }
  assert.ok(fs.existsSync(path.join(output, ".nojekyll")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, "deployment.json"), "utf8")).version, require("./package.json").version);
  assert.ok(!fs.existsSync(path.join(output, "backend-app.js")), "backend source is excluded from public static output");
  assert.ok(!fs.existsSync(path.join(output, ".env.example")), "environment templates are excluded from public static output");

  const packaged = new Set(runtimeFiles);
  for (const file of runtimeFiles.filter((name) => name.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
      const reference = match[1].split(/[?#]/)[0];
      if (!reference || reference.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(reference)) continue;
      const localFile = reference.replace(/^\.\//, "");
      assert.ok(packaged.has(localFile), `${file} dependency ${localFile} is packaged`);
    }
  }

  console.log("Static-site packaging tests passed.");
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
