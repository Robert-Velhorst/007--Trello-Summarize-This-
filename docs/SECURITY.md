# Security

Date: 2026-08-08

## Credential Handling

**Critical rules:**
- API keys (OpenAI, Anthropic, Google) are stored in browser member-private Trello storage only. They are never logged or transmitted to the Trello server.
- Proxy endpoint credentials are configured separately from browser-held keys.
- Backend session-hash secret (`JWT_SECRET`, retained environment-variable name; minimum 32 characters) and admin password (minimum 12 characters) must be provided as environment variables — never hardcoded.
- The backend creates no default end-user account or predictable bootstrap password. Users must register explicitly; tests use disposable, isolated accounts.
- Account emails are normalized and validated at registration and admin edit time; duplicate identities are rejected.
- Registration passwords are bounded to 12-256 characters and processed with asynchronous scrypt. Unknown-user login performs equivalent scrypt work, and admin credential comparisons use timing-safe digests.
- User data exports exclude password hashes, password salts, and sessions. Account deletion cascades owner-scoped data.
- The local backend runtime-store directory is created with owner-only permissions (`0700`) and its JSON state file with owner-only permissions (`0600`) on POSIX hosts. The store is gitignored, but it remains a development-only persistence mechanism rather than a production secret store.
- The `proxy/.dev.vars` file is `.gitignore`d and must never be committed.
- Error messages are sanitized in all three integration modules (`ai-providers.js`, `trello-integration.js`, `attachment-processor.js`) to strip tokens, keys, and sensitive URLs before display.

## AI Summary Honesty Boundaries

- AI summaries must separate facts, inferences, uncertainty, and unsupported claims.
- Confidence scores are review signals, not measured accuracy guarantees.
- Do not claim 99.9% accuracy without measured evidence.
- Attachment text must not be claimed as read unless extraction actually succeeded.

## Sensitive Card Gating

- Cards matching sensitive signal patterns (client, financial, legal) are gated.
- Sensitive card attachment text extraction and provider AI handoff are blocked until explicit operator approval.
- The `detectSensitiveSignals` function in `summarizer-core.js` drives this gate.

## Trello Comment Safety

- Trello comment posting is approval-gated. The user must review and tick approval before any comment can be posted.
- Auto-posting is not implemented and must never be added without explicit approval flow.

## Local Dev Server Security (Phase 115)

The local dev server (`local-dev-server.js`) now sends:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer`
- CORS headers for local development
- OPTIONS preflight handling
- Graceful SIGINT/SIGTERM shutdown

## Backend API Security (Phase 115)

The backend API (`backend-app.js`) now sends:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- CORS headers with preflight handling only for an explicit allowlist (`BACKEND_ALLOWED_ORIGINS`); arbitrary browser origins are rejected before route handling
- A 1 MiB request limit that stops buffering immediately after overflow
- Exclusive runtime locking so backend, worker, and CLI cannot concurrently overwrite the JSON state file
- Idempotency on summary, batch creation, backup creation, and credit mutations
- Bounded sessions, events, jobs, notifications, rate windows, and backup retention
- Non-root Docker execution, dropped Linux capabilities, `no-new-privileges`, loopback Compose binding, and no embedded secrets

## Known Security Gaps (Not Production-Safe)

| Gap | Risk | Mitigation Required |
|---|---|---|
| Admin auth relies on environment credentials | High | Use managed secrets and production identity controls before internet exposure |
| Local JSON token store | Medium | Not suitable for multi-instance production; migrate sessions to production storage |
| Single-process local rate limits only | Medium | Current limits are durable locally; add distributed gateway limits before multi-instance deployment |
| Local backups are not offsite disaster recovery | Medium | Copy encrypted snapshots to owner-controlled remote storage and test a live restore |
| No HTTPS enforcement in backend | Medium | Run behind reverse proxy (nginx/caddy) with TLS |
| Hosted Power-Up origin must be configured | Medium | Set `BACKEND_ALLOWED_ORIGINS` to the exact public Power-Up origin before enabling browser backend calls |

## Update Check Safety

- Update manifests are fetched with `credentials: "omit"` and `referrerPolicy: "no-referrer"`.
- Only URLs from `github.com/Robert-Velhorst/007--Trello-Summarize-This-` or its exact `raw.githubusercontent.com` path are accepted.
- Download URLs from any other domain are rejected by `safeUpdateUrl()` in `summarizer-core.js`.
- Update checks are not triggered automatically on page load.

## No Secrets Committed

Verified on 2026-07-23:
- `.gitignore` covers `.npm-cache/`, `.tmp/`, and `proxy/.dev.vars`.
- No API keys, tokens, or credentials appear in committed source files.
- `trello-config.js` contains a placeholder comment, not a real key.
