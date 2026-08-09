# Technical Audit

Date: 2026-08-09 (production-completion audit)

## Active Product Surface

The shipped product consists of:

- `connector.js`, `popup.html`, and `settings-powerup.html` for the Trello Power-Up experience.
- `summarizer-core.js`, `card-intelligence-ledger.js`, `attachment-processor.js`, `ai-providers.js`, and `trello-integration.js` for analysis, review, export, privacy, and provider integration.
- `backend-app.js`, `backend-storage.js`, `backend-server.js`, `backend-worker.js`, and `backend-lock.js` for the reviewed single-instance backend.
- `backend-cli.js` for lock-safe migration, backup, restore, reconciliation, support, and worker operations.
- `Dockerfile` and `docker-compose.yml` for non-root container deployment.
- `installer/windows` for a standalone Windows 11 install, upgrade, local launch, ngrok sharing, and uninstall path.

## Verification Results

- `npm.cmd run test:all` with PostgreSQL 17: passed.
- `npm.cmd audit --omit=dev` and `npm.cmd audit`: zero vulnerabilities.
- `node doctor.js`: 39 checks passed.
- Docker image build: passed with production dependency audit at zero vulnerabilities.
- Windows packaged backend and install/upgrade/uninstall acceptance: passed.
- HAI account-feed and Connected Sources parser contract: passed.
- Chrome browser QA: desktop and narrow layouts rendered without console warnings/errors or horizontal overflow; standalone settings connected to the local backend.
- All remaining tracked JavaScript and PowerShell files parse.

## Verified Strengths

- Trello context fetch, deterministic fallback, optional AI providers, evidence, confidence, review, feedback, and export paths are wired.
- Trello comments and description replacement remain approval-gated and freshness-checked.
- Provider keys, backend sessions, and review history are private rather than shared card data.
- Attachment extraction is bounded, optional, and honest when binary content cannot be read.
- Local and PostgreSQL stores serialize writes and use single-writer exclusion.
- Rate limits are memory-bounded and do not trigger complete state rewrites.
- The HAI capability URL is per-user, revocable, HMAC-stored, cursor-based, size-bounded, and limited to explicitly approved summaries.
- The Windows static server exposes only the 24 allowlisted runtime files.
- Windows credentials and local data use exact current-user-only ACLs; upgrades preserve both.
- Standalone mode avoids the Trello SDK request and defaults to the installed loopback backend.

## Scope Boundaries

- PDF, Word, Excel, and image OCR extraction remains partial where browser libraries are unavailable; unsupported files stay metadata-only.
- The reviewed batch worker never fetches or writes Trello unattended.
- `BACKEND_STORE=postgres` activates PostgreSQL when `DATABASE_URL` is configured. The bounded pool and advisory writer lock are intentionally single-writer.
- Internet-facing operation still requires operator-managed TLS ingress, secrets, monitoring, and encrypted offsite backups.
- Payments and webhooks fail closed until a signed, reconciled provider implementation exists.
- Confidence is a review signal, not measured accuracy.

## Inactive Areas

Supplementary legacy modules such as `connection.js`, `adminApi.js`, and `credit-usage-analytics.js` are not part of the shipped runtime claim. Invalid, unreferenced files were removed during this audit, including prototype code, fake integration scaffolding, and stale completion documents, rather than retained as apparent product code.

## Completion Baseline

Completion claims are limited to the static Power-Up, reviewed single-instance backend, local or PostgreSQL persistence, Windows standalone installer, and review-gated HAI feed. Marketplace approval, public ingress availability, paid-provider credentials, measured summary accuracy, code signing, and horizontal multi-writer scaling remain external or future gates.
