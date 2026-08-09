# Enhancement Review

Date: 2026-08-09

## Implemented In This Release

1. Production PostgreSQL persistence with bounded pooling, health checks, optimistic revisions, and single-writer exclusion.
2. User-facing backend health, account creation, sign-in, sign-out, and private session storage.
3. Explicitly reviewed summary persistence from the Power-Up.
4. Per-user HAI feed with one-time capability URLs, rotation/revocation, and summary-level approval.
5. Allowlisted GitHub Pages packaging and deployment workflow.
6. Standalone Windows backend, generated private secrets, install/uninstall acceptance, and optional ngrok launcher.
7. Deferred attachment code, bounded database connections, slimmer Docker cache, and generated-directory exclusions.

## Recommended Next Enhancements

| Priority | Enhancement | User value | Main constraint |
|---|---|---|---|
| 1 | Code-sign the Windows installer and executable | Fewer SmartScreen warnings and clearer publisher trust | Requires an owner-controlled signing certificate and protected signing workflow |
| 2 | Add an authenticated HAI app-to-app authorization flow | Creates the connected source after an explicit HAI consent screen | HAI needs a stable scoped authorization API; Summarize This must not reuse browser sessions or store a broad HAI token |
| 3 | Add card-change delta summaries | Faster review by highlighting only what changed since the accepted run | Requires stable Trello action cursors and careful deletion/edit handling |
| 4 | Add on-demand local PDF/Office/OCR workers | Better attachment coverage without slowing every popup | WASM/native libraries increase installer size and need strict file/CPU/memory limits |
| 5 | Split and minify the popup runtime | Lower parse time and transfer size beyond the current 444.4 KB | Requires a reproducible build pipeline and source-map/privacy review |
| 6 | Add encrypted export/offsite restore drills | Better disaster recovery for server deployments | Needs owner-selected storage, key management, retention, and restore evidence |
| 7 | Replace whole-state PostgreSQL JSON with normalized tables | Safe horizontal scaling and more efficient high-volume queries | Larger migration and concurrency redesign; unnecessary for the current single-writer scope |
| 8 | Add independent quality evaluation datasets | Evidence for improving summary behavior and thresholds | Requires representative labels; confidence must remain separate from measured correctness |

## Product Decisions To Keep

- Local deterministic analysis remains the zero-setup fallback.
- AI handoff, Trello writes, public tunneling, backend persistence, and HAI export remain separate approvals.
- HAI remains the authority for HAI source creation, ingestion, memory, workflow, and execution.
- Payment and paid-credit behavior stays disabled until a verified provider and reconciliation design exist.
