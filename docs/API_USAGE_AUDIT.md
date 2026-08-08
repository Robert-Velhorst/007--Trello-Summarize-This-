# API Usage Audit

Date: 2026-07-25
Previous: 2026-07-10

## External APIs Used

### Trello Power-Up JS SDK

| Call | Location | Status | Notes |
|---|---|---|---|
| `TrelloPowerUp.initialize()` | connector.js | Active | Registers all 5 capabilities |
| `t.popup()` | connector.js, popup.html | Active | Opens popup, settings, authorize windows |
| `t.card('all')` / `t.card('id')` | popup.html, connector.js | Active | Card context and ID reads |
| `t.board('all')` | popup.html | Active | Board name and context |
| `t.lists('all')` | popup.html | Active | List context and neighboring cards |
| `t.get('member', 'private', ...)` | connector.js, popup.html | Active | Settings, ledger history, review state reads |
| `t.set('member', 'private', ...)` | popup.html | Active | Settings, ledger, review state writes |
| `t.getRestApi()` | connector.js | Active | Auth status check |
| `t.sizeTo('#app')` | popup.html | Active | Popup height adjustment |
| `t.closePopup()` | popup.html | Active | Close popup after action |

### AI Provider APIs (Direct)

| Provider | Endpoint | Location | Status | Notes |
|---|---|---|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` | ai-providers.js | Active (when key configured) | GPT-4o, GPT-4o-mini |
| Anthropic | `https://api.anthropic.com/v1/messages` | ai-providers.js | Active (when key configured) | Claude models |
| Google AI | `https://generativelanguage.googleapis.com/v1beta/models/...` | ai-providers.js | Active (when key configured) | Gemini models |

### Proxy API

| Endpoint | Location | Status | Notes |
|---|---|---|---|
| Configurable HTTPS proxy URL | ai-providers.js, popup.html | Active (when configured) | Cloudflare Worker proxy; sanitized endpoint |

### GitHub (Update Check)

| Call | Location | Status | Notes |
|---|---|---|---|
| `fetch(updateManifestUrl, { credentials: "omit", referrerPolicy: "no-referrer" })` | popup.html | Active (manual trigger only) | Only from `raw.githubusercontent.com/Robert-Velhorst/...` |

### Trello REST API

| Endpoint | Location | Status | Notes |
|---|---|---|---|
| `GET /1/cards/{id}?...` | trello-integration.js | Active (when Trello token present) | Full card context including comments, checklists, attachments, custom fields |
| `POST /1/cards/{id}/actions/comments` | popup.html | Active (approval-gated) | Comment posting after explicit user approval |

## Backend API Endpoints

All endpoints live in `backend-app.js`. The backend uses a local JSON runtime store and is for local development only.

| Endpoint | Method | Auth | Status | Notes |
|---|---|---|---|---|
| `/api/health` | GET | None | Active | Health and readiness info |
| `/api/readiness` | GET | None | Active | Ready/blocked with missing env list |
| `/api/config` | GET | None | Active | Public config (no secrets) |
| `/api/auth/register` | POST | None | Active | User registration |
| `/api/auth/login` | POST | None | Active | User login → token |
| `/api/user/profile` | GET | Bearer | Active | User profile |
| `/api/user/profile` | DELETE | Bearer + current password | Active | Cascades owner data deletion and sessions |
| `/api/user/data-export` | GET | Bearer | Active | Owner data export excluding password hashes and sessions |
| `/api/user/credits` | GET | Bearer | Active | Credit balance |
| `/api/user/activity` | GET | Bearer | Active | Recent events bearing the requesting user's ID only; global/system events are not exposed |
| `/api/summarize` | POST | Bearer | Active (local only) | Produces a deterministic excerpt with explicit facts, inferences, uncertainty, and unsupported-claim fields; provider/proxy execution is rejected |
| `/api/credits/purchase` | POST | Bearer | Disabled (503) | Never grants credits because no verified payment provider integration exists |
| `/api/webhooks/stripe` | POST | None | Disabled (503) | Never accepts a webhook because signature verification and payment reconciliation are not implemented |
| `/api/batch/jobs` | POST/GET | Bearer | Active | Private persistence ledger for the reviewed popup batch workflow |
| `/api/batch/jobs/:id/start`, `/status`, `/cards/:cardId` | POST | Bearer | Active | Records actual client-side reviewed workflow status and results; ownership, recognized states, terminal-state immutability, and result/error evidence rules are enforced |
| `/api/batch/jobs/:id/run` | POST | Bearer | Active (gated) | Enqueues only explicitly approved local-worker jobs with explicit text; all other jobs return 409 |
| `/api/workspaces` | GET | Bearer | Active | Lists requesting user's memberships |
| `/api/workspaces/:id` | PUT | Owner | Active | Updates bounded workspace settings |
| `/api/workspaces/:id/members` | GET/POST | Member/Owner | Active | Lists members or adds/updates a registered user |
| `/api/workspaces/:id/members/:userId` | DELETE | Owner | Active | Removes non-owner membership |
| `/api/workspaces/:id/summaries` | GET | Member | Active | Shared workspace summary reads |
| `/api/reminders` | GET/POST | Bearer | Active | Durable in-app reminders |
| `/api/reminders/:id` | DELETE | Owner | Active | Cancels owner reminder |
| `/api/notifications` | GET | Bearer | Active | Owner-scoped in-app notifications |
| `/api/notifications/:id/read` | POST | Owner | Active | Marks owner notification read |
| `/api/analytics/events` | POST | Bearer | Active | Allowlisted content-free local event only |
| `/api/admin/auth/login` | POST | None | Active | Admin login |
| `/api/admin/auth/logout` | POST | Admin | Active | Admin logout |
| `/api/admin/auth/refresh` | POST | Admin | Active | Token refresh |
| `/api/admin/auth/verify` | GET | Admin | Active | Verify admin token |
| `/api/admin/system/health` | GET | Admin | Active | System health |
| `/api/admin/dashboard/metrics` | GET | Admin | Active | Dashboard metrics |
| `/api/admin/dashboard/realtime` | GET | Admin | Active | Realtime active tokens + events |
| `/api/admin/users` | GET | Admin | Active | User list (paginated) |
| `/api/admin/users/stats` | GET | Admin | Active | User aggregate stats |
| `/api/admin/users/:id` | GET/PUT/DELETE | Admin | Active | User CRUD |
| `/api/admin/users/:id/activity` | GET | Admin | Active | Per-user activity |
| `/api/admin/users/:id/suspend` | POST | Admin | Active | Suspend user |
| `/api/admin/users/:id/unsuspend` | POST | Admin | Active | Unsuspend user |
| `/api/admin/users/:id/credits` | GET | Admin | Active | User credit balance |
| `/api/admin/users/:id/credits/adjust` | POST | Admin | Active | Credit adjustment |
| `/api/admin/credits/bulk-adjust` | POST | Admin | Active | Bulk credit adjustment |
| `/api/admin/credits/transactions` | GET | Admin | Not implemented (404) | Use `/api/admin/transactions` for the local transaction ledger |
| `/api/admin/credits/stats` | GET | Admin | Not implemented (404) | No aggregate credit-stats endpoint is exposed |
| `/api/admin/transactions` | GET | Admin | Active | All transactions |
| `/api/admin/transactions/stats` | GET | Admin | Not implemented (404) | No transaction-stats endpoint is exposed |
| `/api/admin/transactions/:id` | GET | Admin | Not implemented (404) | No transaction-detail endpoint is exposed |
| `/api/admin/transactions/:id/review` | POST | Admin | Active | Flag transaction for review |
| `/api/admin/transactions/:id/refund` | POST | Admin | Disabled (503) | Never claims a refund or changes credits because payment-provider reconciliation is not implemented |
| `/api/admin/settings` | GET/PUT | Admin | Active | System settings |
| `/api/admin/system/alerts` | GET | Admin | Active | System alerts |
| `/api/admin/system/alerts/:id/acknowledge` | POST | Admin | Active | Acknowledge alert |
| `/api/admin/system/services/:service/restart` | POST | Admin | Disabled (503) | Never claims a restart because no verified service-control integration exists |
| `/api/admin/reports` | GET | Admin | Active | Reports list |
| `/api/admin/reports/generate` | POST | Admin | Active | Generate report |
| `/api/admin/backup/create` | POST | Admin | Active | Creates schema-validated SHA-256 snapshot with retention |
| `/api/admin/backup/list` | GET | Admin | Active | List backups |
| `/api/admin/backup/:id/restore` | POST | Admin + confirm | Active | Integrity-checks snapshot and creates a pre-restore safety backup |
| `/api/admin/data/reconcile` | POST | Admin | Active | Dry-run/apply repair with post-apply verification |
| `/api/admin/exceptions` | GET | Admin | Active | Failed jobs, open alerts, and data issues |
| `/api/admin/support-bundle` | GET | Admin | Active | Redacted runtime/support evidence |
| `/api/admin/maintenance/schedule` | POST | Admin | Active | Create a local maintenance-window record |
| `/api/admin/maintenance/windows` | GET | Admin | Active | List local maintenance-window records |
| `/api/admin/files/upload` | POST | Admin | Not implemented (404) | No backend upload endpoint is exposed |
| `/api/admin/files/:id` | DELETE | Admin | Not implemented (404) | No backend file-record deletion endpoint is exposed |
| `/api/admin/audit` | GET | Admin | Active | Audit event log |

## Phase 115 Security Changes

All API responses now include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- CORS preflight handling (OPTIONS → 204) only for origins in `BACKEND_ALLOWED_ORIGINS`

## Legacy Admin Client

`adminApi.js` is an inactive legacy client that requires undeclared browser dependencies and contains calls to endpoints not exposed by `backend-app.js`. It is not loaded by the shipped Power-Up and must not be treated as a backend API contract.
