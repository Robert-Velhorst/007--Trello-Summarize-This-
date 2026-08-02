const config = require("./backend-config");

const readiness = config.backendReadiness();
const hasMissing = (name) => readiness.missing.some((item) => item.startsWith(name));
const checks = [
  {
    label: "Session hash secret configured",
    ok: !hasMissing("JWT_SECRET"),
    detail: hasMissing("JWT_SECRET") ? "Set JWT_SECRET to at least 32 characters for keyed session-token hashing." : "Present"
  },
  {
    label: "Admin password configured",
    ok: !hasMissing("ADMIN_PASSWORD"),
    detail: hasMissing("ADMIN_PASSWORD") ? "Set ADMIN_PASSWORD to at least 12 characters for the local admin bootstrap account." : "Present"
  },
  {
    label: "Database runtime boundary",
    ok: true,
    detail: readiness.optional.DATABASE_URL ? "DATABASE_URL is configured but ignored: only the local JSON store is implemented." : "No DATABASE_URL configured; backend uses the local JSON store."
  },
  {
    label: "Proxy endpoint shape",
    ok: !config.PROXY_ENDPOINT || /^https:\/\//.test(config.PROXY_ENDPOINT),
    detail: config.PROXY_ENDPOINT || "No proxy endpoint configured"
  },
  {
    label: "Trello app key presence",
    ok: Boolean(config.TRELLO_APP_KEY),
    detail: config.TRELLO_APP_KEY ? "Present" : "Missing; popup/backend safety checks can run, but Trello auth/comment routes will not be usable"
  },
  {
    label: "Real provider or local fallback path",
    ok: readiness.optional.directProviderKey || true,
    detail: readiness.optional.directProviderKey ? "At least one provider key is present" : "No provider key configured; backend can still run in local-only mode"
  }
];

checks.forEach((check) => {
  console.log(`[${check.ok ? "OK" : "FAIL"}] ${check.label} - ${check.detail}`);
});

if (!readiness.ok) {
  process.exit(1);
}

console.log("Backend doctor checks passed.");
