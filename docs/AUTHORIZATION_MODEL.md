# Authorization and Resource Ownership

Date: 2026-07-23 (Phase 008)

## Power-Up Authorization

### Member-Private Storage Isolation

All settings, ledger history, review state, and export records are stored in Trello's member-private storage. Trello enforces isolation — a member can only read and write their own private storage.

No cross-member data sharing is possible through this mechanism.

### Card Data Access

The Power-Up only accesses card data for the card the user has explicitly opened in Trello. It cannot enumerate or batch-access cards without user interaction.

### AI Provider Keys

API keys are stored in member-private storage and never sent to any server controlled by this application (only to the configured AI provider directly, or through the user's own proxy endpoint).

### Trello Write Authorization

Comment posting requires:
1. A valid Trello OAuth token (`t.getRestApi().getToken()`)
2. Explicit human approval in the popup UI (approval checkbox)

No card writes occur without both conditions being true.

## Backend Authorization

### User-Level Access

Protected endpoints require a valid user token:
- `GET /api/user/profile` — own user only
- `GET /api/user/credits` — own credits only
- `POST /api/summarize` — own credits deducted

Token-based user isolation: each token is bound to a `userId`. The backend looks up the user by ID and returns only that user's data.

### Admin-Level Access

Admin endpoints require an admin token (`role: "admin"`):
- All `/api/admin/*` routes
- Admin token obtained via `/api/admin/auth/login`

Admin authority is server-session-based. The admin user-edit route does not permit changing a persisted user's `role` field, so a user-record update cannot create an apparent or effective admin account.

Regular user tokens cannot access admin routes (verified in `adversarial.test.js`).

### Resource Ownership Checks

| Resource | Check |
|---|---|
| User profile | Token userId must match requested userId |
| User credits | Token userId must match requested userId |
| Admin users list | Admin role required |
| Admin credit adjustment | Admin role required |

## Verified Isolation (adversarial.test.js)

- User A and User B registered with distinct tokens
- User A cannot see User B's email in profile response
- User B cannot see User A's email in profile response
- Non-admin token cannot access `/api/admin/users`
- No token → 401 on protected endpoints
- Invalid/expired token → 401 on protected endpoints
