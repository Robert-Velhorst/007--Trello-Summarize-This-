# Task Graph

Date: 2026-08-08

```text
[DONE] Consolidate maintained branch and useful V3 launcher behavior
  -> [DONE] Preserve active Trello popup, safe writeback, and labeled evaluation
  -> [DONE] Version local data and migrate existing stores
      -> [DONE] Workspaces and owner/editor/viewer permissions
      -> [DONE] Durable reviewed jobs, retries, reminders, and notifications
      -> [DONE] Verified backup/restore and data reconciliation
  -> [DONE] Lock backend, worker, and CLI to one store owner
      -> [DONE] Integrated worker for normal server operation
      -> [DONE] Docker and operator controls
  -> [DONE] Security and resource pass
      -> [DONE] Async scrypt, timing-safe checks, body limits, bounded retention
      -> [DONE] Redacted support bundle and privacy-safe data export
  -> [DONE] Verification
      -> [DONE] Core/backend/adversarial/evaluation tests
      -> [DONE] Worker/operations and real HTTP E2E tests
      -> [DONE] 5,000-user pagination test
      -> [DONE] Windows installer build and dependency/resource checks
      -> [EXTERNAL] Docker engine/CI image build

[EXTERNAL] Public HTTPS deployment and Trello listing
[EXTERNAL] Live comment/description writeback acceptance
[EXTERNAL] Representative held-out labeled evaluation
[EXTERNAL] Production database/queue/TLS/monitoring and offsite restore drill
[OPTIONAL EXTERNAL] Payment provider activation and reconciliation
```

Repository work never marks an external node complete without owner/live-environment evidence.
