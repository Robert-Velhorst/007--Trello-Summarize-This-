# Blocked Phases Register

Date: 2026-07-23

> Scope notice: This register lists phases blocked specifically by external dependencies. It is not an exhaustive product-gap list and does not mean every unlisted phase is production-complete. See `docs/GOAL_COMPLETION_MATRIX.md` and `docs/FINAL_VERIFICATION_REPORT.md` for the controlling partial/missing/disabled status.

## Strictly Blocked Phases (Truthful Audit Assessment)

Per the **No False Completion Rule** in the prompt:
> *"If a phase cannot be completed from repo-only work without external accounts, credentials, or a live environment — mark it Blocked, document exactly what is required, and stop."*

The following 13 phases are formally classified as **Blocked** because they require external services, live multi-user backend infrastructure, or third-party accounts that cannot be provisioned from local repository code alone:

| Phase | Title | Exact External Requirement / Blocker |
|---|---|---|
| 016 | Background jobs, schedulers, and workers | Requires external persistent job runner / worker queue infrastructure (e.g. Redis + Bull, Celery, or AWS SQS). |
| 022 | Search, filters, sorting, and pagination | Requires backend database indexing and multi-card search API endpoints beyond local Trello card scope. |
| 027 | Notifications and reminders | Requires external email provider (SendGrid/Mailgun) or WebPush service integration. |
| 032 | Docker and deployment readiness | Requires live production container orchestration (Kubernetes, AWS ECS) and registry credentials. |
| 033 | Database migrations and rollback safety | Requires live production SQL database instance (PostgreSQL) and migration runner execution. |
| 042 | Worker/job test suite | Requires active background worker queue infrastructure to run test suites against. |
| 052 | Large dataset and pagination testing | Requires persistent database prepopulated with thousands of multi-user card records. |
| 053 | Backup and restore procedures | Requires cloud storage bucket (AWS S3) and DB snapshot automation in a live environment. |
| 054 | Incident response and recovery playbook | Requires live production ops environment, PagerDuty integration, and SLA monitoring. |
| 055 | Product analytics local-first design | Requires production telemetry backend ingestion service. |
| 056 | SaaS readiness without forced billing | Requires live Stripe account integration, production database, and multi-tenant billing infrastructure. |
| 106 | Role-based settings and team permissions | Requires production identity provider (IdP) and multi-tenant RBAC database backend. |
| 109 | Exception-based workflow dashboard | Requires persistent cross-board aggregation database and event processing queue. |
