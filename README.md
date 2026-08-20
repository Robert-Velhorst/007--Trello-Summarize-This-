# Summarize This

Summarize This is a Trello Power-Up and optional local/backend application for turning Trello cards into reviewed, evidence-aware operational summaries.

It is built for a practical workflow:

1. Open a Trello card.
2. Click **Summarize This**.
3. Review what the card is about, what has happened, current status, blockers, waiting items, decisions, next actions, and handoff notes.
4. Copy, export, save, or post only after explicit review.

The project intentionally separates supported facts from assumptions. Confidence scores are review signals, not measured accuracy guarantees.

Current version: `1.1.3`

Repository: <https://github.com/Noodzakelijk-Online/007--Trello-Summarize-This->

## Who This Is For

### Non-technical users

Use this tool when Trello cards contain too much scattered information and you want a clearer status update. It can read the visible card context, produce a structured summary, and help you decide what needs action.

You do not need to understand the code to use the Windows installer or the Trello Power-Up setup assistant. The installer adds Start menu shortcuts for opening the local app, configuring Trello, starting an explicit ngrok tunnel, and uninstalling the app.

### Software developers and operators

This repository contains:

- A static Trello Power-Up frontend.
- A deterministic browser summarizer.
- Optional direct AI provider calls.
- Optional proxy AI mode.
- An authenticated local/server backend.
- Local JSON or PostgreSQL persistence.
- A review-gated HAI JSON feed.
- Docker deployment artifacts.
- A Windows 11 `.exe` installer build.
- CI, diagnostics, tests, security documentation, and operational runbooks.

## What The Tool Does

### Trello Power-Up

The Power-Up adds a card button named **Summarize This**. The popup reads card context available through Trello's Power-Up client and produces a structured card intelligence view.

It can use:

- Card title and description.
- Board and list names.
- Labels, members, due dates, checklist progress, and custom fields.
- Comments and recent activity where Trello exposes them.
- Attachment metadata.
- Optional bounded text/CSV attachment previews when enabled.
- Bounded current-list context for planning and trend signals.

The popup then shows:

- Operational digest.
- About/status/history.
- Next actions.
- Blockers and risks.
- Waiting-on items.
- Unclear or conflicting points.
- Robert decision items.
- VA/team handoff items.
- Evidence and source coverage.
- Validation findings.
- Confidence factors.
- Review state and prior corrections.
- Export/postback history.
- Runtime timing metrics.

### Local deterministic summary

The app works without an AI key. `summarizer-core.js` contains a deterministic fallback summarizer that builds a useful summary from Trello card structure and visible metadata.

This fallback is important because:

- First-run setup works without paid provider credentials.
- Sensitive cards can stay local until the user approves AI handoff.
- Provider failures can fall back cleanly in Auto mode.
- Tests can verify core behavior without external services.

### Optional AI analysis

When configured, the app can call OpenAI, Google AI, or Anthropic. AI output is normalized into the same operational schema as local summaries.

Supported provider modes include:

- Single provider with fallback.
- Auto provider selection.
- Optional consensus review across configured providers.
- Optional backend proxy endpoint so provider keys can stay server-side.

The prompt is bounded to reduce privacy exposure, cost, and latency. Large card fields are capped before being sent to providers.

### Review and export

The tool is designed around explicit human review. It can create drafts and exports, but consequential external actions are gated.

Supported review/export flows include:

- Markdown export.
- Plain text export.
- Structured JSON ledger export.
- Status update.
- Operational digest.
- Robert decision brief.
- VA/team handoff brief.
- Decision handoff packet.
- Change brief from prior run history.
- Reviewed Trello comment draft.
- Approval-gated Trello comment posting.

Trello writeback is not automatic. Comment posting requires visible review and approval. Description replacement is wired with source-freshness checks, but still requires live Trello verification before production use.

### Backend and persistence

The optional backend provides account, storage, worker, operations, HAI, and support workflows.

It supports:

- Authenticated user registration and login.
- Asynchronous scrypt password hashing.
- Local JSON store for single-machine use.
- PostgreSQL mode with bounded connection pool and writer exclusion.
- Workspaces and role-based access.
- Reminders and notifications.
- Reviewed local batch worker.
- Backups, restore safety copies, and reconciliation.
- Redacted support bundle.
- Health/readiness/config endpoints.
- Per-user HAI capability URLs.

The backend is single-writer by design. It is suitable for local/single-instance operation, not horizontal multi-writer production without further database and queue work.

### Windows 11 app

The repository includes a Windows installer path. The installer is intended for easy local use and for starting a local backend/UI without requiring the end user to install Node.js or Docker.

Installed behavior:

- Installs to `%LOCALAPPDATA%\SummarizeThis`.
- Creates Start menu shortcuts.
- Starts the local UI on loopback.
- Starts the bundled backend on `127.0.0.1`, preferring port `18787`.
- Selects a safe fallback port if the preferred backend port is occupied.
- Stores generated secrets and runtime data with current-user-only permissions.
- Preserves data during upgrades.
- Can launch an explicit ngrok tunnel when the user chooses to share the backend.
- Does not start ngrok automatically.
- Does not create a predictable default account.
- Refuses public tunnel exposure before a local owner account exists.

The installed app and Trello Power-Up are related but separate:

- The installed app can run locally on Windows.
- Trello itself must load Power-Up files from a public HTTPS URL.
- The Start menu setup assistant helps prepare the Trello admin values.

## Main Entry Points

| File | Purpose |
|---|---|
| `connector.html` | Hosted iframe connector page used by Trello. Loads Trello SDK, shared config, and `connector.js`. |
| `connector.js` | Registers Power-Up capabilities, card button, settings popup, authorization status, and badge behavior. |
| `popup.html` | Active card analysis UI. This is the main user-facing Power-Up popup. |
| `settings-powerup.html` | Settings UI for provider mode, keys, proxy endpoint, backend account, HAI URL, language, prompts, and limits. |
| `summarizer-core.js` | Shared summarization, prompt building, validation, sensitivity, export, list, batch, version, and utility logic. |
| `card-intelligence-ledger.js` | Private card intelligence ledger, history, review, feedback, evidence, and export record logic. |
| `attachment-processor.js` | Metadata-first attachment handling and bounded safe text/CSV extraction. |
| `ai-providers.js` | Provider integrations and sanitized provider error handling. |
| `trello-integration.js` | Trello API integration helpers and sanitized Trello errors. |
| `backend-server.js` | Backend HTTP server entrypoint. |
| `backend-app.js` | Backend route application and middleware. |
| `backend-storage.js` | Local/PostgreSQL persistence abstraction. |
| `backend-worker.js` | Reminder and reviewed local-worker processing. |
| `doctor.js` | Repository/runtime diagnostics. |
| `backend-doctor.js` | Backend environment and configuration diagnostics. |
| `runtime-files.json` | Allowlist for the public static build and Windows runtime payload. |
| `installer/windows/build-installer.ps1` | Builds the Windows installer. |
| `docker-compose.yml` | Single-instance Docker backend and PostgreSQL stack. |
| `proxy/cloudflare-worker.mjs` | Optional Cloudflare Worker AI proxy reference implementation. |

Legacy popup filenames such as `popup-999-accuracy.html`, `popup-enhanced.html`, `popup-nextgen.html`, and `popup-original.html` are retained for compatibility and redirect/route toward the active popup flow.

## Quick Start For Users

### Option A: Use the Windows 11 installer

1. Download `SummarizeThisSetup.exe` from the release or CI artifact.
2. Run it as the current Windows user.
3. Open **Summarize This** from the Start menu.
4. Create the local owner account when prompted.
5. Use **Configure Trello Power-Up** if you want to connect Trello.
6. Use **Share Backend with ngrok** only when a public HTTPS tunnel is needed.

The Windows app does not require administrator rights, Node.js, Docker, or a background service.

### Option B: Use the hosted Trello Power-Up

1. Go to <https://trello.com/power-ups/admin>.
2. Open or create the **Summarize This** Power-Up.
3. Set the iframe Connector URL to the hosted `connector.html` URL.
4. Enable the required capabilities:
   - `card-buttons`
   - `card-detail-badges`
   - `show-settings`
   - `authorization-status`
   - `show-authorization`
5. Save the Power-Up.
6. Enable it on the Trello board.
7. Open a card and click **Summarize This**.

The connector URL used during the recent setup work was:

```text
https://robert-velhorst.github.io/007--Trello-Summarize-This-/connector.html?v=20260814.3
```

If this repository is deployed under a different GitHub Pages owner or custom domain, use that deployment's HTTPS `connector.html` URL instead.

### Option C: Run from source

```bash
git clone https://github.com/Noodzakelijk-Online/007--Trello-Summarize-This-.git
cd 007--Trello-Summarize-This-
npm install
npm start
```

Local static UI:

```text
http://127.0.0.1:17117/
```

Local connector preview:

```text
http://127.0.0.1:17117/connector.html
```

Trello cannot use a private `127.0.0.1` connector URL from its hosted website. For real Trello use, deploy the static runtime to a public HTTPS origin or expose it deliberately through an approved tunnel.

## Developer Setup

### Requirements

- Node.js 20 or 22.
- npm.
- PowerShell on Windows for installer scripts.
- Docker only if running the Docker backend stack.
- PostgreSQL only if running PostgreSQL tests or production-like storage.

### Install dependencies

```bash
npm install
```

### Run the static development server

```bash
npm start
```

This runs `local-dev-server.js` and serves the static app from loopback.

### Run the backend locally

The backend requires explicit secrets and fails closed if they are missing.

Example for PowerShell:

```powershell
$env:JWT_SECRET = "replace-with-at-least-32-random-characters"
$env:ADMIN_PASSWORD = "replace-with-at-least-12-random-characters"
$env:REGISTRATION_MODE = "closed"
$env:BACKEND_ALLOWED_ORIGINS = "http://127.0.0.1:17117,http://localhost:17117"
npm run start:backend
```

Important environment variables:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Secret used to key opaque backend session-token hashes. Minimum 32 characters. |
| `ADMIN_PASSWORD` | Admin password for backend admin operations. Minimum 12 characters. |
| `REGISTRATION_MODE` | `closed`, `single-user`, or `open`. Defaults to `closed`. |
| `BACKEND_ALLOWED_ORIGINS` | Exact browser origins allowed by backend CORS. |
| `BACKEND_STORE_PATH` | Optional path for the local JSON store. |
| `BACKEND_STORE` | `local` or `postgres`. |
| `DATABASE_URL` | PostgreSQL connection URL when using PostgreSQL mode. |
| `DB_POOL_MAX` | PostgreSQL pool size, bounded by config. |
| `RUN_WORKER` | Runs reminders and approved local jobs inside the backend process when `true`. |
| `HAI_CONNECTOR_ENABLED` | Enables per-user read-only HAI feeds when `true`. |
| `TRELLO_APP_KEY` | Public Trello app key used by browser auth/comment flows. |

Use `.env.example` as a template, but never commit real secrets.

## Build And Release

### Build the static site

```bash
npm run build:static
```

This copies only the allowlisted runtime files from `runtime-files.json` into `dist/static-site`.

### GitHub Pages

`.github/workflows/deploy-pages.yml` runs on `main` and:

1. Checks out the repository.
2. Uses Node.js 22.
3. Runs `node static-site.test.js`.
4. Runs `node tools/build-static-site.js`.
5. Deploys `dist/static-site` to GitHub Pages.

### Build the Windows backend executable

```bash
npm run build:windows-backend
```

This uses `@yao-pkg/pkg` to build:

```text
dist/windows-backend/SummarizeThisBackend.exe
```

### Build the Windows installer

```powershell
npm run build:windows-installer
```

Output:

```text
dist\windows-installer\SummarizeThisSetup.exe
```

The installer includes the static runtime, launch scripts, generated secret handling, bundled backend executable, update manifest, and setup assistant. See `docs/WINDOWS_INSTALLER.md` and `installer/windows/README.md`.

### Docker backend

```bash
cp .env.example .env
# Edit .env with real secrets.
docker compose up --build -d
docker compose ps
```

The Docker stack is single-instance by design. It uses PostgreSQL 17, loopback binding, a non-root backend container, dropped Linux capabilities, health checks, bounded pooling, and named volumes.

## AI, Privacy, And Provider Modes

The default safe path is local deterministic analysis. AI is optional.

When AI is enabled:

- Card context is capped before it enters the prompt.
- Sensitive client, financial, legal, or personal signals can require explicit approval before provider handoff.
- Provider errors are sanitized before display.
- Direct provider keys are stored in Trello member-private Power-Up storage.
- Local standalone preview strips API keys from local storage and saves non-key settings only.
- Proxy mode can keep provider keys server-side.
- AI-only mode fails if no provider/proxy path is configured.

The tool must not be marketed as having a measured fixed accuracy percentage. The checked-in evaluation harness currently proves contract behavior against synthetic fixtures, not real-world accuracy.

## HAI Connector

The HAI connector is disabled by default on server deployments and enabled in the private Windows loopback backend.

It provides a read-only JSON feed containing only summaries that a signed-in user explicitly reviewed, saved, and approved for HAI.

Security properties:

- Each user gets a separate capability URL.
- The database stores only HMAC hashes of capability tokens.
- Rotating the URL revokes the previous URL.
- Revocation is available from settings.
- Unapproved summaries are not returned.
- Original card text, API keys, backend sessions, and other users' records are not returned.
- Trello source links are cleaned to `https://trello.com/c/...`.
- The feed cannot modify Trello or execute HAI actions.

See `docs/HAI_CONNECTOR.md`.

## Resource Usage

The product is designed to stay lightweight:

- Static Power-Up runtime.
- No Electron dependency.
- No always-on Windows service.
- No automatic update polling.
- Manual update checks only.
- Badge refresh slowed to reduce repeated reads.
- AI prompt and response sizes are bounded.
- Attachment extraction is off by default and limited to small HTTPS text-like files.
- Binary attachments remain metadata-only unless a safe supported extractor path is available.
- Ledger/history records are compact and capped.
- Backend worker sleeps between bounded cycles and does not fetch Trello or providers.
- PostgreSQL pool is bounded.

Current documented measurements are in `docs/RESOURCE_USAGE_ANALYSIS.md`. Measurements can drift as features change, so rerun the resource analysis before release:

```bash
npm run analyze:resources
```

## Security Model

Important boundaries:

- No committed provider keys or backend secrets.
- `.env`, runtime data, installer staging, npm cache, and proxy `.dev.vars` are ignored.
- Backend registration defaults to `closed`.
- Windows registration uses `single-user` and accepts the first owner only from the local host.
- Windows refuses public tunnel exposure before an owner exists.
- Passwords are hashed with asynchronous scrypt.
- Unknown-user login performs equivalent password work to reduce timing-based identity discovery.
- User exports exclude password hashes, salts, and sessions.
- Backend CORS accepts only exact configured origins.
- Backend request bodies are bounded.
- Error output is sanitized for keys, tokens, sensitive URLs, and common PII patterns.
- Trello writes require explicit approval.
- Sensitive AI handoff and sensitive exports require review.
- HAI feeds are owner-scoped and read-only.
- Docker runs non-root with reduced privileges.

Known security gaps are tracked in `docs/SECURITY.md`. This project is suitable for local/single-instance operation, not unsupervised multi-tenant internet production without additional managed identity, secrets, monitoring, TLS ingress, offsite backups, and data-model work.

## Testing And Verification

### Standard tests

```bash
npm test
```

Runs:

```text
node test.js && node backend.test.js
```

### Full local suite

```bash
npm run test:all
```

Runs the core, static package, backend, operations, HTTP E2E, large dataset, PostgreSQL, adversarial, and evaluation suites. PostgreSQL-related tests require a suitable test database environment.

### Useful focused checks

```bash
node test.js
node static-site.test.js
node backend.test.js
node operations.test.js
node e2e.test.js
node large-dataset.test.js
node adversarial.test.js
node evaluation.test.js
npm run doctor
npm run doctor:backend
npm run analyze:resources
npm run test:windows-payload
```

### Manual Trello checks

Automated tests do not prove Trello's live hosted UI. Before claiming live readiness, test on an expendable Trello card:

1. Power-Up appears on the card.
2. Popup opens.
3. Card context loads.
4. Local summary works with no AI key.
5. Configured AI path works, if intended.
6. Review state saves and reloads.
7. Copy/export works.
8. Trello comment draft is blocked until approval.
9. Approved Trello comment appears on the card.
10. Badge reflects analysis/review status.
11. Settings save and reload correctly.

Acceptance evidence and open manual steps are tracked in `docs/ACCEPTANCE_TESTS.md` and `docs/FINAL_VERIFICATION_REPORT.md`.

## Repository Structure

```text
.
|-- .github/workflows/          GitHub Actions for CI, CodeQL, Pages deployment
|-- database/                   PostgreSQL connection helpers
|-- docs/                       Architecture, safety, verification, runbooks, audits
|-- fixtures/                   Synthetic labeled evaluation fixture
|-- installer/windows/          Windows install, uninstall, launcher, ngrok scripts
|-- middleware/                 Shared backend middleware helpers
|-- proxy/                      Optional Cloudflare Worker AI proxy
|-- tools/                      Static build, resource analysis, evaluation, Windows checks
|-- connector.html              Trello iframe connector HTML entrypoint
|-- connector.js                Trello Power-Up capability registration
|-- popup.html                  Main Power-Up analysis popup
|-- settings-powerup.html       Power-Up settings and backend/HAI configuration
|-- summarizer-core.js          Main shared browser/test summarization logic
|-- card-intelligence-ledger.js Private ledger and review model
|-- backend-*.js                Backend server, config, storage, migrations, worker, support
|-- runtime-files.json          Static/installer runtime allowlist
|-- package.json                Scripts, version, and dependency metadata
`-- update.json                 Manual Windows update manifest
```

## Documentation Map

Start here:

- `docs/USER_GUIDE.md` for user-facing workflows.
- `docs/OPERATOR_RUNBOOK.md` for running, deploying, testing, and operating.
- `docs/GOAL_COMPLETION_MATRIX.md` for implemented, partial, missing, and externally gated scope.
- `docs/FINAL_VERIFICATION_REPORT.md` for verification evidence and open gates.
- `docs/SECURITY.md` for the security model and known gaps.
- `docs/RESOURCE_USAGE_ANALYSIS.md` for footprint and utilization review.
- `docs/FEATURE_IMPROVEMENT_ANALYSIS.md` for implemented improvements and remaining product opportunities.
- `docs/API_CONTRACT.md` for backend response contracts and endpoints.
- `docs/HAI_CONNECTOR.md` for the HAI feed contract.
- `docs/WINDOWS_INSTALLER.md` for installer behavior.
- `proxy/README.md` for the optional Cloudflare Worker proxy.

Historical phase documents and audit logs remain in `docs/` for traceability. Prefer the newer files above when deciding current behavior.

## Current Status

Implemented and verified in local/single-instance scope:

- Trello Power-Up card button and popup.
- Card context fetch and deterministic summary.
- Optional direct provider and proxy AI paths.
- Evidence, validation, confidence, review, feedback, and export flows.
- Approval-gated Trello comment posting.
- Private card intelligence ledger.
- Backend account/session/storage/workspace/reminder/backup/reconcile/support APIs.
- Reviewed local-worker jobs.
- HAI JSON feed contract.
- Docker single-instance deployment.
- GitHub Pages static deployment workflow.
- Windows 11 installer and local backend launcher.
- Resource and security hardening.

Partial or externally gated:

- Live Trello marketplace/listing approval.
- Fresh live Trello writeback acceptance on expendable cards.
- Live HAI source creation under the owner's HAI session.
- Public tunnel acceptance for the chosen ngrok domain.
- Measured real-world accuracy claim from independently labeled cards.
- Code signing for Windows SmartScreen.
- Multi-instance production scaling.
- Managed production secrets, monitoring, TLS ingress, and offsite disaster recovery.
- Payment processing.
- Full binary PDF/Office/OCR attachment extraction.

## Common Misunderstandings

### "Does it guarantee accuracy?"

No. The tool provides evidence-aware summaries and confidence/review signals. It does not provide a verified fixed accuracy percentage.

### "Can Trello use the Windows app directly?"

No. Trello must load a Power-Up from a public HTTPS URL. The Windows app can run the local tool and backend, and an explicit tunnel can expose the backend when needed, but Trello's connector still needs HTTPS hosting.

### "Are AI keys required?"

No. The deterministic summarizer works without provider keys. AI keys or proxy mode are optional.

### "Are Trello comments posted automatically?"

No. Comment posting is approval-gated.

### "Can HAI read every summary?"

No. HAI receives only summaries that the signed-in owner explicitly approved for HAI through a per-user capability URL.

### "Is this production multi-tenant SaaS?"

No. It is a local/single-instance product with Docker and PostgreSQL support. Multi-tenant production requires additional identity, infrastructure, data model, secret management, backup, monitoring, and scaling work.

## Contributing

1. Create a branch from the current `main`.
2. Keep changes scoped.
3. Do not commit secrets, generated runtime stores, or local tunnel data.
4. Run the relevant tests before opening a pull request.
5. Update documentation when behavior changes.
6. Keep confidence, AI, provider, and live-integration claims evidence-based.

## License

`package.json` declares the project license as MIT. A standalone `LICENSE` file is not currently present in the repository.

## Support And Issues

Use GitHub Issues for bugs, setup problems, or feature requests:

<https://github.com/Noodzakelijk-Online/007--Trello-Summarize-This-/issues>

For operational problems, start with:

- `docs/TROUBLESHOOTING_GUIDE.md`
- `docs/OPERATOR_RUNBOOK.md`
- `docs/SECURITY.md`
- `docs/FINAL_VERIFICATION_REPORT.md`
