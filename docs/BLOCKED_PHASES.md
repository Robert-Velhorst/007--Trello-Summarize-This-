# External Gates Register

Date: 2026-08-08

The repository-only deliverables for phases 000-115 now have local implementations or evidence. That does not make every live-service outcome complete. The following gates require owner credentials, third-party approval, representative private data, or a live environment and cannot be truthfully manufactured in source code.

| Gate | Current repository state | Required external action |
|---|---|---|
| Public HTTPS Power-Up hosting | Static runtime and setup assistant implemented | Deploy the selected commit to an owner-controlled HTTPS host and save its connector URL in Trello |
| Trello marketplace/listing | Connector and capability configuration implemented | Submit and obtain Trello approval if public distribution is desired |
| Live Trello writeback acceptance | Description/comment writes are approval-gated, freshness-checked, and ambiguity-safe | Run the documented test on an expendable card using the deployed build |
| Provider activation | Direct and optional proxy paths exist; local fallback is functional | Supply user-owned provider credentials and accept provider terms/costs |
| Measured accuracy claim | Labeled evaluation harness exists; checked-in data is synthetic | Provide a representative, independently labeled, held-out dataset and review disagreements |
| Production multi-instance service | Single-instance JSON backend, integrated worker, migrations, local backup, Docker image, and runtime lock exist | Provision a production database, managed secret store, TLS ingress, monitoring, and multi-instance job queue before scaling beyond one instance |
| Offsite disaster recovery | Verified local backup/restore exists | Configure encrypted offsite retention and perform a restore drill in the chosen production environment |
| Payments | Billing is disabled; local summaries are free; purchase/webhook/refund paths fail closed | Choose a payment provider and implement verified signatures, reconciliation, dispute/refund handling, and legal review before enabling billing |

No external gate is represented as completed. Local functionality remains usable without payments, production hosting, or a provider key through the deterministic reviewed workflow.
