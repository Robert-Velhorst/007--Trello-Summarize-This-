# Roadmap And External Gates

Date: 2026-08-08

## Highest-Value Next Work

1. Deploy the static Power-Up to an owner-controlled HTTPS origin and repeat comment/description acceptance tests on expendable Trello cards.
2. Collect a representative, independently labeled card set and run the checked-in evaluation harness; do not turn heuristic confidence into an accuracy claim.
3. Decide whether browser-dependent PDF/Office/OCR extraction should be shipped or whether metadata-only remains the privacy boundary.
4. If multiple backend instances are needed, migrate the local JSON state to a managed database and queue while retaining workspace ownership, idempotency, leases, repair, and audit semantics.
5. Configure encrypted offsite backups and perform a live restore drill before treating the backend as production operations.
6. Enable payments only if there is a verified commercial need and signature/reconciliation/refund/legal work is complete. Local mode intentionally works without billing.

## External Gates

Provider credentials, public hosting, Trello listing approval, live writeback verification, representative labeled data, production infrastructure, and payment-provider activation remain owner/external actions. Exact evidence and requirements are maintained in `BLOCKED_PHASES.md`.
