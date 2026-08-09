# Audit Logging and Event History

Date: 2026-07-23 (Phase 019)

## Client-Side Audit (Member-Private Trello Storage)

All analysis runs, exports, and feedback events are recorded in the user's member-private Trello storage via `card-intelligence-ledger.js`:

| Event | Recorded fields |
|---|---|
| Analysis run | runId, cardId, cardTitle, provider, model, timestamp, qualityScore, outputMode, language, costRecord, timingRecord |
| Export | exportType, format, runId, timestamp |
| Review state change | reviewState ("pending"/"approved"/"rejected"), timestamp |
| Feedback | rating, correctionText, incorrectSections, createdAt |

This history is visible to the user in the popup's ledger history panel and is used to build the `priorFeedback` context for the next AI prompt.

## Backend Audit Log (Local JSON Runtime Store)

`backend-app.js` maintains a `store.events` array. Events are appended on:
- User registration / login
- Credit purchase / adjustment
- Summarize call
- Admin actions

Events are accessible at `GET /api/admin/audit` (admin token required).

**Limitation:** The event log is retained in the local JSON runtime store but has no production retention, integrity, access-control, or multi-instance guarantees. A production database and audit-log controls are required for production audit logging.

## What Is NOT Logged

- Raw AI provider responses (not stored — only structured summary is kept)
- API keys (never logged anywhere in the system)
- Card description text (only metadata like card name and structure is stored in ledger)
- Trello OAuth tokens (ephemeral per session)

## Audit Retention

Client-side ledger: retained in Trello member-private storage until the user clears it or removes the Power-Up. No server-side copy.

Backend events: retained in the local JSON runtime store until the local store is removed or replaced. See `docs/DATA_RETENTION_AND_ARCHIVAL_POLICY.md` for the policy.
