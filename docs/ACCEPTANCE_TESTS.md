# Acceptance Tests

Date: 2026-08-08
Previous: 2026-07-12

## Automated Acceptance Tests

### Test Suite: `node test.js`

| Test | Expected | Actual | Status |
|---|---|---|---|
| Required docs exist (TECHNICAL_AUDIT, CRITICAL_PATH, etc.) | Files present under docs/ | All present | PASS |
| No overclaiming in README/guides (no 99.9% accuracy) | No match | No match found | PASS |
| Connector loads shared Trello config | popup.html and connector.html reference trello-config.js | Confirmed | PASS |
| Popup uses sanitized error messages | sanitizeUserVisibleError used | Confirmed | PASS |
| Popup approval-gates Trello comment posting | Approval flow present | Confirmed | PASS |
| Popup does not auto-check updates on load | No DOMContentLoaded -> checkForUpdates | Confirmed | PASS |
| Popup supports dark mode | color-scheme and prefers-color-scheme present | Confirmed | PASS |
| Local rule-based analysis produces valid output | about, nextSteps, insights populated | Confirmed | PASS |
| Dutch language output works | Dutch keywords present | Confirmed | PASS |
| Stale card detection works | 41-day stale message appears | Confirmed | PASS |
| AI prompt includes required fields | robertDecisions, vaReadyActions, evidenceClaims present | Confirmed | PASS |
| Attachment classification works | document, transcript, recording correctly classified | Confirmed | PASS |
| Sensitive signal detection works | client, financial categories detected | Confirmed | PASS |
| Proxy settings sanitized | Userinfo rejected, HTTPS enforced | Confirmed | PASS |
| Version comparison works | Correct comparison results | Confirmed | PASS |
| Budget tracking works | Warning and exceeded states computed | Confirmed | PASS |
| Batch analysis plan and progress tracking works | Correct queue, approval, and progress | Confirmed | PASS |
| List trend signals generated | overdue, label-concentration, waiting-title-signals | Confirmed | PASS |
| Windows installer file consistency | Build and install scripts agree on files | Confirmed | PASS |

### Test Suite: `node backend.test.js`

| Test | Expected | Actual | Status |
|---|---|---|---|
| Backend contract tests | All backend API assertions pass | Passed | PASS |

### Operations And End-To-End Suites

| Suite | Coverage | Status |
|---|---|---|
| `node operations.test.js` | Schema migration, worker success/retry/failure, reminders, backup/restore, repair, redaction, runtime lock | PASS |
| `node e2e.test.js` | Real HTTP auth, roles, shared summaries, free local mode, reviewed worker, backup, support bundle | PASS |
| `node large-dataset.test.js` | Search, sort, and pagination across 5,000 users | PASS |
| `node adversarial.test.js` | Cross-user isolation, path/URL and provider failure safety | PASS |
| `node evaluation.test.js` | Synthetic labeled-harness contract, not measured accuracy proof | PASS |

### Doctor: `node doctor.js`

| Check | Status |
|---|---|
| All 21 required runtime/operations files exist | PASS |
| Shared Trello config defined | PASS |
| Connector/popup/authorize load config | PASS |
| Manifest points to connector.html | PASS |
| Package exposes backend scripts | PASS |
| Backend server fails fast on missing env | PASS |
| Backend health/readiness endpoints exist | PASS |
| Node.js version >= 18 | PASS |
| Core modules load (5 modules) | PASS |
| docs/ directory exists | PASS |

## Manual Acceptance Tests (from 2026-07-12)

Previously verified by the user in a live Trello environment:

| Test | Expected | Actual | Status |
|---|---|---|---|
| Power-Up appears in Trello card | Card button visible | Confirmed | PASS |
| Popup opens and fetches card context | Card data loaded | Confirmed | PASS |
| Local summary generates without API keys | Summary displayed | Confirmed | PASS |
| Settings panel opens from Power-Up settings | Settings UI loads | Confirmed | PASS |
| Badge shows on card detail | Status badge visible | Confirmed | PASS |

## Phase 115 — Additional Manual Steps Required

The following require human verification in a live Trello board:

1. Open a Trello card with the Power-Up installed.
2. Click "Summarize This" → verify popup loads and card context is fetched.
3. Verify local summary generates when no AI keys are configured.
4. Configure an AI provider key → verify provider summary generates with confidence display.
5. Review the summary → verify review state is captured.
6. Export/copy the summary → verify copy-to-clipboard and download work.
7. Draft a Trello comment → verify approval gate prevents auto-posting.
8. Post the comment with approval → verify comment appears on Trello card.
9. Check badge → verify badge reflects analysis state (confidence % or "Analyzed").
10. Open settings → verify settings save and reload correctly.
