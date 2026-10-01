"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { COLLECTIONS, CURRENT_SCHEMA_VERSION, createInitialState, migrateState, validateState } = require("./backend-migrations");

const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const MAX_IMPORT_DEPTH = 128;

function validateImportStructure(input) {
  function* entries(object) {
    for (const key in object) {
      if (Object.hasOwn(object, key)) yield [key, object[key]];
    }
  }
  // Use an iterator stack so wide collections do not allocate another full tree.
  const stack = [entries(input)];
  while (stack.length) {
    const next = stack[stack.length - 1].next();
    if (next.done) {
      stack.pop();
      continue;
    }
    const [key, value] = next.value;
    if (key === "__proto__") throw new Error("Import contains an unsafe object field.");
    if (value && typeof value === "object") {
      if (stack.length >= MAX_IMPORT_DEPTH) throw new Error("Import structure exceeds the supported nesting depth.");
      stack.push(entries(value));
    }
  }
}

function counts(state) {
  return Object.fromEntries(COLLECTIONS.map((name) => [name, state[name].length]));
}

async function inspectImport(filePath, expectedSha256) {
  const sourcePath = path.resolve(filePath);
  const handle = await fs.open(sourcePath, "r");
  let raw;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMPORT_BYTES) {
      throw new Error("Import must be a non-empty regular JSON file no larger than 64 MiB.");
    }
    // Bound the read even if the source file grows while it is being inspected.
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error("Import file changed during reading; use a stopped-backend snapshot.");
    raw = buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  if (expectedSha256 && (!/^[a-f0-9]{64}$/i.test(expectedSha256) || sha256 !== expectedSha256.toLowerCase())) {
    throw new Error("Import checksum does not match the approved source file.");
  }
  let input;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch (_) {
    throw new Error("Import file is not valid UTF-8 JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !input.meta || !Number.isInteger(input.meta.schemaVersion) ||
      input.meta.schemaVersion < 1 || input.meta.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error("Import has an unsupported or missing schema version.");
  }
  for (const name of COLLECTIONS) {
    if ((Object.hasOwn(input, name) && !Array.isArray(input[name])) ||
        (input.meta.schemaVersion === CURRENT_SCHEMA_VERSION && !Array.isArray(input[name]))) {
      throw new Error(`Invalid import collection: ${name}.`);
    }
  }
  if (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) {
    throw new Error("Import settings must be an object.");
  }
  const allowedKeys = new Set(["meta", "settings", ...COLLECTIONS]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error("Import contains unsupported top-level fields.");
  }
  validateImportStructure(input);
  const migrated = migrateState(input);
  const validation = validateState(migrated.state);
  if (!validation.ok) throw new Error(`Invalid import: ${validation.errors.join("; ")}`);
  for (const name of COLLECTIONS) {
    const ids = new Set();
    for (const record of migrated.state[name]) {
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Invalid record in ${name}.`);
      if (record.id !== undefined) {
        if (typeof record.id !== "string" || !record.id || ids.has(record.id)) throw new Error(`Invalid or duplicate ID in ${name}.`);
        ids.add(record.id);
      }
    }
  }
  const emails = new Set();
  for (const user of migrated.state.users) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!user.id || !email || emails.has(email)) throw new Error("Import contains invalid or duplicate user identities.");
    emails.add(email);
  }
  return {
    sourcePath,
    state: migrated.state,
    summary: { sha256, bytes: raw.length, fromVersion: migrated.fromVersion, toVersion: migrated.toVersion, counts: counts(migrated.state) }
  };
}

async function importIntoEmptyStore(store, transfer) {
  if (store.storageKind !== "postgres" && path.resolve(store.filePath) === transfer.sourcePath) {
    throw new Error("The source file cannot also be the destination store.");
  }
  const original = await store.snapshot();
  const settings = { ...original.settings };
  delete settings.updatedAt;
  if (COLLECTIONS.some((name) => original[name].length) || !isDeepStrictEqual(settings, createInitialState().settings)) {
    throw new Error("Import refused: the destination already contains records or configured settings.");
  }
  try {
    await store.transaction((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, JSON.parse(JSON.stringify(transfer.state)));
    });
  } catch (error) {
    store.state = original;
    throw error;
  }
  return { imported: true, ...transfer.summary };
}

module.exports = { MAX_IMPORT_BYTES, inspectImport, importIntoEmptyStore };
