# API Contract and Error Envelope

Date: 2026-07-23 (Phase 009)

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
| 202 | Accepted (async/stub) |
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
User roles are not editable through the admin user-update route (`422`); admin authority comes only from the separate admin session login.

### User
```
GET  /api/user/profile  → 200 { success, user }
GET  /api/user/credits  → 200 { success, credits }
GET  /api/user/activity → 200 { success, activity }
POST /api/summarize { text } → 200 { success, summary, creditsUsed, remaining }
```

## Error Sanitization

Malformed JSON bodies return `400`; bodies larger than the backend limit return `413`. These expected client errors do not create a high-severity runtime alert. Unexpected server failures return only `500 { success: false, error: "Internal server error" }`; their detailed message is retained in the local high-severity alert record rather than sent to the caller.

### Reviewed Batch Ledger

The batch API is a private ledger for observed popup workflow results, not a server-side execution engine. Job terminal states are derived from recorded card outcomes and cannot be set directly. Card updates accept only recognized reviewed-workflow states; an `analyzed` state requires an observed result object, and `blocked`/`failed` states require an observed error reason. Invalid or fabricated-looking state updates return `422`.

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
