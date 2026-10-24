"use strict";

const assert = require("node:assert/strict");
const { supportedNodeVersion } = require("./node-runtime-policy");
for (const version of ["v24.22.1", "24.23.0", "v26.12.1", "26.13.0"]) {
  assert.equal(supportedNodeVersion(version), true, version);
}
for (const version of ["v18.20.8", "v22.23.4", "24.22.0", "26.12.0", "25.0.0", "27.0.0", "26.12.1-rc.1", "invalid"]) {
  assert.equal(supportedNodeVersion(version), false, version);
}
assert.equal(supportedNodeVersion(process.version), true, "Current test runtime must satisfy the same policy");
console.log("Node runtime policy: 12 version boundaries and current runtime passed.");
