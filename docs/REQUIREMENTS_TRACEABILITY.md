# Requirements Traceability

Date: 2026-08-08

| Requirement family | Primary implementation | Verification |
|---|---|---|
| Trello connector, card context, reviewed writeback | `connector.js`, `popup.html`, `trello-integration.js` | `test.js`, manual Trello acceptance checklist |
| Evidence, confidence, deterministic fallback | `summarizer-core.js`, `backend-summary.js` | `test.js`, `evaluation.test.js` |
| Authentication, ownership, privacy deletion | `backend-app.js`, `backend-storage.js` | `backend.test.js`, `adversarial.test.js`, `e2e.test.js` |
| Workspaces and team roles | `backend-migrations.js`, workspace API routes | `e2e.test.js` |
| Durable jobs, retries, reminders | `backend-worker.js`, `backend-server.js`, `backend-lock.js` | `operations.test.js`, `e2e.test.js` |
| Search, filters, sorting, pagination | `queryCollection` API helper | `large-dataset.test.js` |
| Migrations, backup, restore, reconciliation | `backend-migrations.js`, `backend-storage.js`, `backend-cli.js` | `operations.test.js`, `backend.test.js` |
| Security and resource controls | request limits, async scrypt, timing-safe checks, runtime lock, bounded collections | `backend.test.js`, `adversarial.test.js`, `tools/resource-analysis.js`, `npm audit` |
| Windows 11 install | `installer/windows/` | `npm run build:windows-installer`, `test.js`, CI Windows job |
| Container deployment | `Dockerfile`, `docker-compose.yml`, `.env.example` | CI container-build job and health endpoint |
| Truthfulness and external gates | phase ledger, completion matrix, external gates register | `doctor.js`, docs CI, final verification report |

The complete phase-by-phase map remains in `PHASE_STATUS_LEDGER.md`. Live service gates are in `BLOCKED_PHASES.md` and are not claimed as repository completions.
