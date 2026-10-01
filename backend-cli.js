#!/usr/bin/env node
"use strict";

const config = require("./backend-config");
const { createBackendStore, resolveBackendFilePath, resolveBackendStoreType } = require("./backend-storage");
const { buildSupportBundle } = require("./backend-support");
const { processWorkerCycle } = require("./backend-worker");
const { acquireRuntimeLock } = require("./backend-lock");
const { inspectImport, importIntoEmptyStore } = require("./backend-transfer");

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "status";
  let transfer = null;
  if (command === "inspect-import" || command === "import-state") {
    if (!argv[1]) throw new Error(`Usage: backend-cli.js ${command} <snapshot.json>`);
    const checksumArgument = argv.find((value) => value.startsWith("--sha256="));
    if (command === "import-state" && (!argv.includes("--confirm") || !checksumArgument)) {
      throw new Error("Usage: backend-cli.js import-state <snapshot.json> --sha256=<approved-sha256> --confirm");
    }
    transfer = await inspectImport(argv[1], checksumArgument && checksumArgument.slice(9));
    if (command === "inspect-import") {
      print(transfer.summary);
      return;
    }
  }
  const filePath = resolveBackendFilePath({ filePath: process.env.BACKEND_STORE_PATH });
  const runtimeLock = resolveBackendStoreType({}) === "local"
    ? await acquireRuntimeLock(filePath, `operator CLI (${command})`)
    : { release: async () => {} };
  let store = null;
  try {
  store = await createBackendStore({ filePath });
  if (command === "import-state") {
    print(await importIntoEmptyStore(store, transfer));
    return;
  }
  if (command === "status") {
    const snapshot = await store.snapshot();
    print({ schema: await store.schemaInfo(), readiness: config.backendReadiness(), counts: Object.fromEntries(Object.entries(snapshot).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])) });
    return;
  }
  if (command === "migrate") {
    print(await store.migrate());
    return;
  }
  if (command === "backup") {
    print(await store.createBackup({ reason: argv.slice(1).join(" ") || "operator CLI" }));
    return;
  }
  if (command === "restore") {
    if (!argv[1] || !argv.includes("--confirm")) throw new Error("Usage: backend-cli.js restore <backup-id> --confirm");
    const safetyBackup = await store.createBackup({ reason: `pre-restore safety snapshot for ${argv[1]}` });
    const restored = await store.restoreBackup(argv[1]);
    if (!restored) throw new Error(`Backup not found: ${argv[1]}`);
    print({ restored, safetyBackup });
    return;
  }
  if (command === "reconcile") {
    print(await store.reconcile({ apply: argv.includes("--apply") }));
    return;
  }
  if (command === "support-bundle") {
    print(await buildSupportBundle(store, config.backendReadiness()));
    return;
  }
  if (command === "worker-once") {
    print(await processWorkerCycle(store));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
  } finally {
    if (store && typeof store.close === "function") await store.close();
    await runtimeLock.release();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
