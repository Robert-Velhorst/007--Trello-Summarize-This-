"use strict";

/**
 * feature-flags.js
 *
 * Lightweight, local-first feature flag system.
 * Flags are resolved from environment variables (for backend/CI)
 * or localStorage (for browser context), with a hard-coded default.
 *
 * Phase 058 — Feature flags and rollout controls.
 *
 * Usage (Node.js):
 *   const flags = require('./feature-flags');
 *   if (flags.isEnabled('ENABLE_CONSENSUS_MODE')) { ... }
 *
 * Usage (browser — after loading as UMD or via script tag):
 *   if (SummarizeThisFlags.isEnabled('ENABLE_CONSENSUS_MODE')) { ... }
 */

const FLAG_DEFINITIONS = [
  {
    key: "ENABLE_CONSENSUS_MODE",
    description: "Allow multi-provider consensus AI analysis",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_BATCH_ANALYSIS",
    description: "Allow batch analysis plan generation from list context",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_PROXY_MODE",
    description: "Allow proxy endpoint for AI calls",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_ATTACHMENT_TEXT_EXTRACTION",
    description: "Allow bounded text/CSV extraction from attachments",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_TRELLO_COMMENT_POST",
    description: "Allow approval-gated Trello comment posting",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_UPDATE_CHECK",
    description: "Allow manual update check against GitHub release manifest",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_BUDGET_TRACKING",
    description: "Track per-provider monthly spend against configured limits",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_DUTCH_LANGUAGE",
    description: "Allow Dutch output language selection",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_LIST_TREND_SIGNALS",
    description: "Show list trend signals and planning brief",
    defaultValue: true,
    rolloutPercent: 100
  },
  {
    key: "ENABLE_BACKEND_ADMIN",
    description: "Enable backend admin API and admin panel (requires JWT_SECRET + ADMIN_PASSWORD)",
    defaultValue: false,
    rolloutPercent: 0
  }
];

/**
 * Read a flag override from the environment or localStorage.
 * Returns undefined if no override is set.
 */
function readOverride(key) {
  // Node.js / backend
  if (typeof process !== "undefined" && process.env && process.env[key] !== undefined) {
    const v = process.env[key].trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  // Browser
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
    const v = localStorage.getItem("summarize_this_flag_" + key);
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

/**
 * Resolve the effective value of a flag.
 */
function isEnabled(key) {
  const def = FLAG_DEFINITIONS.find((f) => f.key === key);
  if (!def) {
    return false;
  }
  const override = readOverride(key);
  if (override !== undefined) return override;
  return def.defaultValue && def.rolloutPercent === 100;
}

/**
 * Return all flags with their resolved values and metadata.
 * Safe to expose in debug endpoints — no credential values.
 */
function getAllFlags() {
  return FLAG_DEFINITIONS.map((def) => ({
    key: def.key,
    description: def.description,
    defaultValue: def.defaultValue,
    rolloutPercent: def.rolloutPercent,
    effectiveValue: isEnabled(def.key),
    overriddenByEnv: typeof process !== "undefined" && process.env && process.env[def.key] !== undefined
  }));
}

/**
 * Normalize a flag set from a plain object (e.g. loaded from settings).
 * Unknown keys are ignored. Returns a validated map.
 */
function normalizeFlagOverrides(raw) {
  if (!raw || typeof raw !== "object") return {};
  const result = {};
  FLAG_DEFINITIONS.forEach((def) => {
    if (Object.prototype.hasOwnProperty.call(raw, def.key)) {
      result[def.key] = Boolean(raw[def.key]);
    }
  });
  return result;
}

const exported = {
  FLAG_DEFINITIONS,
  isEnabled,
  getAllFlags,
  normalizeFlagOverrides
};

// UMD export for browser + Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
} else if (typeof globalThis !== "undefined") {
  globalThis.SummarizeThisFlags = exported;
}
