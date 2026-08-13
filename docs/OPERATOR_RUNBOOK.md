# Operator Runbook

Date: 2026-08-09

## How to Run Locally

### Windows 11 Installed App

Run `SummarizeThisSetup.exe`, then use the Start menu shortcuts:

- **Summarize This** starts the bundled backend and local UI.
- **Configure Trello Power-Up** opens the setup assistant.
- **Configure ngrok domain** validates and saves a reserved HTTPS domain for future tunnels.
- **Share Backend with ngrok** starts an explicit HTTPS tunnel after checking the backend. ngrok must already be installed and authorized.
- **Uninstall Summarize This** stops the exact installed backend process and removes the per-user installation.

The installed backend prefers `http://127.0.0.1:18787/api` and automatically selects a safe loopback fallback if another application owns that port. The launcher passes the selected port to the UI and ngrok. Generated secrets and the local store stay under the current user's LocalAppData installation folder.

### Prerequisites

- Node.js 20 or 22 for repository development and CI
- No other dependencies required for the static Power-Up

### Start the Static Power-Up Server

```bash
cd /path/to/007--Trello-Summarize-This-
npm start
# Starts at http://127.0.0.1:17117/
# Connector entrypoint: http://127.0.0.1:17117/connector.html
```

### Start the Backend API Server

The backend requires environment variables. It will refuse to start without them:

```bash
export JWT_SECRET="your-secret-here"
export ADMIN_PASSWORD="your-admin-password-here"
export RUN_WORKER="true"
# Optional:
export TRELLO_APP_KEY="your-trello-app-key"
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="AI..."

npm run start:backend
# Starts at http://127.0.0.1:8787/api/health
```

### Environment Variable Reference

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret used to key opaque session-token hashes (minimum 32 characters; retained name for compatibility) |
| `ADMIN_PASSWORD` | Yes | Local admin panel password (minimum 12 characters) |
| `REGISTRATION_MODE` | Recommended | `closed` (default), `single-user`, or explicit `open` for intended multi-user deployments |
| `TRELLO_APP_KEY` | Recommended | Trello Power-Up app key for comment/auth routes |
| `OPENAI_API_KEY` | Optional | Used by the browser Power-Up direct-provider flow; the local backend does not execute provider calls |
| `ANTHROPIC_API_KEY` | Optional | Used by the browser Power-Up direct-provider flow; the local backend does not execute provider calls |
| `GOOGLE_API_KEY` | Optional | Used by the browser Power-Up direct-provider flow; the local backend does not execute provider calls |
| `PROXY_ENDPOINT` | Optional | Used by the browser Power-Up proxy flow; the local backend does not proxy requests |
| `BACKEND_ALLOWED_ORIGINS` | Required for hosted backend use | Comma-separated hosted Power-Up origins allowed to make browser API requests; local defaults are `http://127.0.0.1:17117,http://localhost:17117` |
| `RUN_WORKER` | Recommended | `true` runs reminders and approved local batch jobs inside the single backend process |
| `WORKER_INTERVAL_MS` | Optional | Worker interval, minimum 1000 ms; default 5000 ms |
| `BACKEND_STORE_PATH` | Optional | Absolute or working-directory-relative JSON store path; backend, worker, and CLI must use the same value |
| `BACKEND_STORE` | Optional | `local` or `postgres`; a configured `DATABASE_URL` selects PostgreSQL when no explicit local file path is supplied |
| `DATABASE_URL` | Required for PostgreSQL | PostgreSQL connection URL; keep credentials in managed environment secrets |
| `DB_POOL_MAX` | Optional | PostgreSQL pool size, bounded to 1-20; default 4 |
| `DATABASE_SSL` | Optional | `true` enables PostgreSQL TLS; certificate verification is on unless explicitly disabled |
| `HAI_CONNECTOR_ENABLED` | Optional | `true` enables per-user read-only HAI feeds; default false on server deployments |
| `STRIPE_SECRET_KEY` | Not active | Reserved for a future verified Stripe integration; purchases remain disabled |
| `STRIPE_WEBHOOK_SECRET` | Not active | Reserved for a future verified Stripe integration; webhooks remain disabled |

## How to Run Migrations

Schema migrations run automatically and fail closed on unsupported future versions. The local store uses a file lock; PostgreSQL uses an advisory writer lock. Offline commands require the active backend writer to be stopped.

```bash
npm run backend:status
npm run backend:migrate
npm run backend:backup
npm run backend:reconcile
node backend-cli.js reconcile --apply
```

See `BACKUP_RESTORE.md` and `DATA_RECONCILIATION.md`.

## How to Run Workers/Schedulers

Set `RUN_WORKER=true` on the backend. This is the supported continuous mode. `npm run worker:once` is an offline one-cycle command and refuses to start while the backend owns the store. See `WORKER_OPERATIONS.md`.

## How to Run Tests

```bash
npm test
# Runs: node test.js && node backend.test.js
# Expected output:
#   All summarizer tests passed.
#   Backend contract tests passed.
```

Individual test suites:
```bash
node test.js          # Core logic, popup contract, installer, summarizer
node backend.test.js  # Backend API contract tests
node operations.test.js # Migrations, worker, backup, repair, redaction, locking
node e2e.test.js       # Real HTTP critical path
node large-dataset.test.js # 5,000-user search/pagination
node postgres.test.js   # PostgreSQL persistence/restart/writer exclusion when TEST_DATABASE_URL is set
node evaluation.test.js # Labeled evaluation harness
```

## How to Run Diagnostics

```bash
npm run doctor           # Full Power-Up and operations diagnostics
npm run doctor:backend   # Backend environment and config diagnostics
```

## How to Verify the Critical Path

**Trello card selected → context fetched → attachments/comments/checklists parsed → AI/deterministic summary generated → confidence/evidence shown → user edits/exports → feedback captured → audit stored**

### Automated (local)

```bash
node test.js
# Verifies: normalization, prompt generation, local analysis, batch analysis,
# list trend signals, feedback capture, export shapes, and popup contract.
```

### Manual (requires live Trello board)

1. Install the Power-Up by hosting connector.html at a public HTTPS URL (or use ngrok for local testing)
2. Add the Power-Up to a Trello board using `manifest.json`
3. Open a Trello card with description, labels, comments, and attachments
4. Click "Summarize This" → verify popup opens and card context loads
5. Verify summary is generated (local if no API keys; AI if keys configured)
6. Verify confidence score and evidence sections are displayed
7. Edit/copy the summary → verify clipboard copy works
8. Draft a Trello comment → verify approval gate blocks auto-posting
9. Tick approval and post → verify comment appears on Trello card
10. Reopen popup → verify ledger history shows the previous analysis

## How to Deploy (Static Power-Up)

1. Run `npm run build:static`; deploy only the generated `dist/static-site` artifact.
2. Keep `runtime-files.json` as the source allowlist and configure the public Trello app key in `trello-config.js`.
3. Register the Power-Up at https://trello.com/power-ups/admin with:
   - Connector URL: `https://your-host/connector.html`
   - Capabilities: card-buttons, card-detail-badges, show-settings, authorization-status, show-authorization

## How to Deploy the Proxy (Optional)

```bash
cd proxy/
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your provider keys
npx wrangler deploy
```

See `proxy/README.md` for full instructions.

## Docker Backend

```bash
cp .env.example .env
# Replace JWT_SECRET, ADMIN_PASSWORD, and POSTGRES_PASSWORD.
docker compose up --build -d
docker compose ps
```

Compose binds the backend to `127.0.0.1:8787`, runs PostgreSQL 17 without a host port, uses a bounded backend pool, runs as a non-root user with dropped capabilities, stores state in named volumes, and runs the worker inside the backend process. Add owner-controlled TLS ingress before exposing it beyond the local machine.

## Security Warnings

- Do not commit `.dev.vars`, `JWT_SECRET`, or any provider keys.
- Backend stores async-scrypt password hashes in a local JSON runtime store and excludes hash material from user exports. Admin login still depends on environment credentials; use a managed secret store and production identity control before internet exposure.
- The `proxy/.dev.vars` file is excluded by `.gitignore`.
- AI summaries must not be presented as verified facts without human review.

## Known Limitations

1. Desktop uses a local JSON store; server deployments support PostgreSQL but deliberately allow one active writer.
2. User passwords use asynchronous scrypt, but admin authentication still relies on environment credentials.
3. Local file and PostgreSQL advisory locks deliberately limit the release to one writer; scale-out requires normalized transactional tables and distributed coordination.
4. Binary attachment extraction depends on browser library availability and otherwise falls back honestly to metadata.
5. Local worker execution requires explicit source text and approval, stops at review-required, and never fetches or writes Trello.
6. Trello description replacement is wired with explicit approval and source-freshness checks, but requires live Trello verification before production use.
7. Measured accuracy proof is not available; confidence is a heuristic signal.

## Blocked Items and External Requirements

| Item | Blocker |
|---|---|
| Trello Power-Up listing | Requires Trello developer account approval |
| AI provider calls | Requires API key from OpenAI, Anthropic, or Google |
| Stripe payments | Requires Stripe account and key |
| Multi-instance production backend | Requires production database, job queue, TLS, managed secrets, and monitoring |
| Offsite disaster recovery | Requires encrypted remote storage and a live restore drill |
| Proxy deployment | Requires Cloudflare account |
