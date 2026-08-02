# Task Graph

Date: 2026-07-23 (Phase 115)

## Phase 115 Task Dependencies

```
Phase 115: Final Human-Operator Readiness Test
│
├─ [DONE] Repository inspection
│   ├─ git status, branch, log
│   ├─ file tree listing
│   └─ key file review (connector.js, summarizer-core.js, backend-app.js, etc.)
│
├─ [DONE] Fix broken tests
│   └─ test.js line 96 regex mismatch → Fixed
│
├─ [DONE] Code hardening
│   ├─ connector.js error boundaries
│   ├─ local-dev-server.js security headers + graceful shutdown
│   └─ backend-app.js security headers + CORS preflight
│
├─ [DONE] Doctor enhancements
│   └─ doctor.js: Node.js version check, core module loading, docs directory
│
├─ [DONE] Test verification
│   ├─ node test.js → PASSED
│   ├─ node backend.test.js → PASSED
│   └─ node doctor.js → PASSED (30/30)
│
├─ [DONE] Documentation updates
│   ├─ docs/TECHNICAL_AUDIT.md
│   ├─ docs/CRITICAL_PATH.md
│   ├─ docs/ACCEPTANCE_TESTS.md
│   ├─ docs/GOAL_COMPLETION_MATRIX.md
│   ├─ docs/FINAL_VERIFICATION_REPORT.md
│   ├─ docs/OPERATOR_RUNBOOK.md
│   ├─ docs/SECURITY.md
│   ├─ docs/FINAL_NO_EXCUSES_SEARCH.md
│   ├─ docs/CODEX_WORKLOG.md
│   ├─ docs/CODEX_CHECKPOINTS.md
│   ├─ docs/PHASE_STATUS_LEDGER.md
│   ├─ docs/TASK_GRAPH.md
│   ├─ docs/UI_ACTION_AUDIT.md
│   └─ docs/API_USAGE_AUDIT.md
│
└─ [DONE] Git hygiene
    ├─ Stage all project files
    └─ Commit with Phase 115 message
```

## Dependency Map for Future Work

```
[BLOCKED] Measured accuracy proof
  └─ Requires: real user study with ground truth labels + live Trello environment

[BLOCKED] Production backend
  └─ Requires: database provisioning + HTTPS + stronger admin credential handling + rate limiting

[IMPLEMENTED LOCALLY — LIVE VERIFICATION PENDING] Trello description replacement
  └─ Requires: Trello REST API write permissions + safe-write flow design

[BLOCKED] Trello Power-Up listing
  └─ Requires: Trello developer account approval + external HTTPS hosting

[BLOCKED] AI provider calls in production
  └─ Requires: OpenAI / Anthropic / Google API account approval and billing

[PARTIAL] Binary attachment OCR
  └─ Requires: server-side OCR library integration + safe content policy

[PARTIAL] Automated E2E tests
  └─ Requires: Trello Power-Up sandbox environment
```
