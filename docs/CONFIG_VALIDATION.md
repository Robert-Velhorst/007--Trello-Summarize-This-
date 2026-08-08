# Configuration Validation and Startup Guards

Date: 2026-07-23 (Phase 006)

## Power-Up Configuration Validation

All user-facing settings are validated through `SummarizeThis.normalizeXxx()` functions in `summarizer-core.js` before use:

| Setting | Validator | Constraints |
|---|---|---|
| Provider mode | `normalizeProviderMode()` | Must be "auto", "local", "consensus", or "fallback" |
| Output mode | `normalizeOutputMode()` | Must be a known mode key; defaults to "operational-ledger" |
| Output language | `normalizeOutputLanguage()` | Must be "en" or "nl"; defaults to "en" |
| Max output tokens | `normalizeGenerationSettings()` | Clamped to 300–2000; defaults to 900 |
| Default copy format | `normalizeExportPreferences()` | Must be a known format key; rejects unknown |
| Proxy settings | `normalizeProxySettings()` | HTTPS required; no credentials in URL; localhost allowed |
| Budget settings | `normalizeBudgetSettings()` | Negative limits clamped to 0; percent clamped to 0–100 |
| Custom instructions | `normalizeCustomInstructions()` | Length-capped at 600 chars |
| Prompt templates | `normalizePromptTemplateSettings()` | IDs sanitized; empty instructions excluded |

## Backend Startup Guards

`backend-server.js` calls `config.backendReadiness()` at startup. If required env vars are missing:

```
Error: Backend startup blocked. Missing required environment variables: JWT_SECRET, ADMIN_PASSWORD
```

The server exits with code 1 before accepting any requests.

Required: `JWT_SECRET` (minimum 32 characters), `ADMIN_PASSWORD` (minimum 12 characters)
Ignored/not active: `DATABASE_URL`, `STRIPE_SECRET_KEY`; optional for the local backend: `TRELLO_APP_KEY`, provider keys. Setting `DATABASE_URL` does not enable a database backend; an explicit non-local store request is rejected.

## Local Dev Server Startup

`local-dev-server.js` has no required configuration. It binds to `127.0.0.1:17117` by default and accepts `PORT` and `HOST` environment overrides.

## Doctor Commands

```bash
npm run doctor           # Verifies required files, operations routes, module loading, and Node.js version
npm run doctor:backend   # Verifies env vars, proxy shape, Trello key presence
```

## Test-Time Validation

`test.js` validates normalizer behaviors for all settings:
- Rejects out-of-range token counts
- Rejects credentials in proxy URLs
- Rejects unknown output modes
- Caps custom instructions
- Excludes unknown copy format values
