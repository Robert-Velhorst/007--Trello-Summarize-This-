# API Contract and Error Envelope

Date: 2026-08-08

## Response Envelope

All backend JSON responses follow a consistent envelope:

### Success
```json
{ "success": true, "<resource>": { ... } }
```

### Error
```json
{ "success": false, "error": "Human-readable error message" }
```

### Health
```json
{ "status": "ok" | "ready" | "blocked", ... }
```

## Standard HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 202 | Accepted for durable worker processing |
| 204 | No content (OPTIONS preflight) |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Not found |
| 409 | Conflict (duplicate email) |
| 413 | Request body too large |
| 500 | Internal server error |
| 503 | Service unavailable (backend not ready) |

## Key Endpoints

### Health and Readiness
```
GET /api/health    → 200 { status, service, timestamp, readiness, trello }
GET /api/readiness → 200|503 { status, missing, optional }
GET /api/config    → 200 { host, port, trello, backend, paths }
```

## Browser-Origin Boundary

Browser requests with an `Origin` header are accepted only when the exact origin appears in `BACKEND_ALLOWED_ORIGINS`. Local development defaults to `http://127.0.0.1:17117,http://localhost:17117`; hosted deployments must set their public Power-Up origin explicitly. Requests without an `Origin` header (for example, server-to-server diagnostics) are not CORS requests.

### Auth
```
POST /api/auth/register { email, password, name } → 201 { success, user, token }
POST /api/auth/login    { email, password }        → 200 { success, user, token }
```

Authentication and registration attempts are throttled by both normalized email and direct socket client address before password verification. A throttled request returns `429` with `retryAfterSeconds`; the local limits are documented in `docs/RATE_LIMIT_POLICY.md`.

Registration requires a valid email address. Admin user updates reject malformed email addresses (`400`) and duplicate addresses (`409`).
Registration passwords contain 12-256 characters and are hashed with asynchronous scrypt. Login performs equivalent password work for unknown users to reduce timing-based identity discovery.
User roles are not editable through the admin user-update route (`422`); admin authority comes only from the separate admin session login.

### User
```
GET  /api/user/profile  → 200 { success, user }
GET  /api/user/data-export → 200 { success, data }
DELETE /api/user/profile { password } → 200 { success, removed }
GET  /api/user/credits  → 200 { success, credits }
GET  /api/user/activity → 200 { success, activity }
POST /api/summarize { text } → 200 { success, summary, creditsUsed, remaining }
```

When `billingMode` is disabled, deterministic local summaries use zero credits. Payment endpoints remain disabled and cannot grant credits from unverified client input.

## Error Sanitization

Malformed JSON bodies return `400`; bodies larger than the backend limit return `413`. These expected client errors do not create a high-severity runtime alert. Unexpected server failures return only `500 { success: false, error: "Internal server error" }`; their detailed message is retained in the local high-severity alert record rather than sent to the caller.

### Reviewed Batch And Local Worker

Manual jobs remain a private ledger for observed popup results. A job can use `executionMode: "local-worker"` only with `executionApproved: true` and at least 50 characters of explicit text per card. `POST /run` enqueues that bounded job; the worker never fetches Trello or calls a provider and successful cards stop at `review-required`. Terminal states remain derived from card outcomes. Invalid or fabricated-looking state updates return `422`.

### Workspace, Reminder, And Operations APIs

Workspace routes enforce owner/editor/viewer memberships. Owners manage names and membership; members can read shared workspace summaries. Reminder routes create durable in-app notifications. Admin operations expose verified backup/restore, dry-run/apply reconciliation, exception aggregation, and a content/credential-redacted support bundle. Searchable list routes accept bounded `q`, `status`, `sort`, `limit`, and `offset` parameters.

All error messages shown to users pass through `sanitizeErrorMessage()` before display. This strips:
- Bearer tokens, API keys (`sk-*`, `Bearer *`, `api_key=*`)
- Trello tokens (`token=*`)
- Attachment URLs (`https://attachments.*`)
- PII patterns

See `ai-providers.js`, `trello-integration.js`, `attachment-processor.js`.

## Popup Provider Contract

The popup expects AI provider responses to be valid JSON matching:
```json
{
  "about": "string",
  "blockers": ["..."],
  "robertDecisions": ["..."],
  "vaReadyActions": ["..."],
  "nextSteps": ["..."],
  "evidenceClaims": ["..."],
  "validationFindings": ["..."],
  "unresolvedQuestions": ["..."],
  "waitingOn": ["..."],
  "unclearPoints": ["..."],
  "risks": ["..."],
  "insights": ["..."],
  "history": "string",
  "status": "string",
  "recommendations": ["..."]
}
```

Non-JSON or partial responses are handled gracefully with `parseProviderJson()`.
