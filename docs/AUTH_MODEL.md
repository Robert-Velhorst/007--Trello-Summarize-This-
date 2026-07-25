# Authentication Model and Session Security

Date: 2026-07-23 (Phase 007)

## Power-Up Authentication (Browser)

The static Power-Up uses Trello's built-in OAuth flow:

1. The Power-Up registers `authorization-status` and `show-authorization` capabilities.
2. `connector.js` calls `t.getRestApi()` to get the Trello REST API handle.
3. `rest.getToken()` returns the user's Trello OAuth token if authorized.
4. The token is used only for REST API calls (fetching comments, posting comments).
5. The token is never stored in member-private storage — it is obtained fresh per-session.

**Token scope:** Read access to card, comments, attachments. Write access to card comments (for posting only).

**Token lifetime:** Per Trello OAuth session. The Power-Up re-requests if the token is missing.

## Backend Authentication (Local Development Only)

The backend uses a lightweight server-recorded session model:

### Registration and Login

```
POST /api/auth/register  { email, password, name }  → { user, token }
POST /api/auth/login     { email, password }          → { user, token }
```

Tokens are opaque random values in the `st_<random>` form. The backend stores only an HMAC-SHA-256 hash of each token, keyed with the required `JWT_SECRET` environment value, together with its user, role, expiry, and revocation state; it does not issue standard JWTs.

Sessions are server-recorded, token hashes (not raw tokens) are stored, and sessions expire after seven days. An expired or malformed-expiry session is rejected and revoked on use.

### Token Verification

All protected endpoints call `requireSession(store, req, res, role)` which:
1. Reads `Authorization: Bearer <token>`
2. Derives its keyed hash and looks up the active server-side session in the local JSON runtime store
3. Checks role, expiry, revocation state, and the associated user account
4. Returns `401` if invalid or missing

## Account Identity Validation

- Registration requires a normalized, syntactically valid email address.
- Admin account edits reject malformed addresses and reject an address already held by another user (`409`).
- Partial admin edits update only supplied fields, preserving the remaining account identity data.

### Admin Authentication

Separate admin token flow via `/api/admin/auth/login`. The server-side session record has `role: "admin"`; admin-only routes require that role.

## Security Gaps (Not Production-Safe)

| Gap | Risk | Required Fix |
|---|---|---|
| Admin authentication depends on environment credentials and there is no production-grade identity system | Critical | Preserve salted user password hashing, and replace env-only admin auth with a stronger production auth model |
| Local opaque-token session design | Medium | Use a production session service or a carefully implemented JWT/OIDC design as appropriate |
| Local JSON session store | Medium | Add Redis or DB-backed session store |
| No refresh token flow | Low | Add refresh token endpoint |

## Trello Power-Up Security Boundary

- Card data is fetched inside Trello's iframe sandbox.
- The Power-Up cannot access other Trello boards or cards without explicit Trello permission.
- Member-private storage is isolated per Trello member and Power-Up key.
