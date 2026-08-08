# Regression Baseline

Date: 2026-08-08

## Baseline Behaviors To Preserve

- Popup opens from the Trello card button
- Settings remain member-private in Power-Up mode
- Local summarizer works without provider configuration
- Direct-provider and proxy paths keep evidence and validation display intact
- Sensitive-card gating blocks provider handoff until approval
- Binary attachments remain honestly represented as metadata-only
- Trello comment posting stays approval-gated
- Review/export history remains private and persistent
- Local billing-disabled summaries remain usable without purchasable credits
- Local-worker jobs require explicit source text/approval and stop at review-required
- Workspace viewers cannot change settings or membership
- User exports exclude password material and account deletion cascades owner data
- Backup restore verifies SHA-256/schema and creates a safety snapshot
- Backend, worker, and CLI cannot concurrently own the JSON store
