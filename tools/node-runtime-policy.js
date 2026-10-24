"use strict";

function supportedNodeVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major === 24) return minor > 22 || (minor === 22 && patch >= 1);
  if (major === 26) return minor > 12 || (minor === 12 && patch >= 1);
  return false;
}

module.exports = { supportedNodeVersion };
