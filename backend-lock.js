"use strict";

const fs = require("node:fs");
const path = require("node:path");

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function acquireRuntimeLock(storePath, owner = "runtime") {
  const lockPath = `${storePath}.runtime.lock`;
  await fs.promises.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let handle = null;
  for (let attempt = 0; attempt < 2 && !handle; attempt += 1) {
    try {
      handle = await fs.promises.open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
      let existing;
      try {
        existing = JSON.parse(await fs.promises.readFile(lockPath, "utf8"));
      } catch (_readError) {
        throw new Error("Runtime startup blocked: the backend store lock exists but its owner cannot be verified.");
      }
      if (processIsRunning(Number(existing.pid))) {
        throw new Error(`Runtime startup blocked: ${existing.owner || "another process"} (PID ${existing.pid}) owns the backend store lock.`);
      }
      await fs.promises.unlink(lockPath);
    }
  }
  if (!handle) throw new Error("Runtime startup blocked: another process acquired the backend store lock.");
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, owner, startedAt: new Date().toISOString() }));
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.promises.unlink(lockPath).catch(() => {});
    throw error;
  }
  let released = false;
  return {
    path: lockPath,
    async release() {
      if (released) return;
      released = true;
      await handle.close();
      await fs.promises.unlink(lockPath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  };
}

module.exports = { acquireRuntimeLock, processIsRunning };
