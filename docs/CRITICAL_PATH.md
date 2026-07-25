# Critical Path

Date: 2026-07-23 (Phase 115 update)
Previous: 2026-07-10

## Active Critical Path

The current critical path for the shipped Power-Up is:

1. User opens a Trello card.
2. User clicks the `Summarize This` card button from `connector.js`.
3. `popup.html` loads and requests card context through the Trello Power-Up runtime.
4. The popup gathers:
   - card, board, and list data
   - comments
   - activity
   - checklist data
   - attachment metadata
   - optional bounded text/CSV attachment excerpts
   - custom fields when exposed
5. The popup normalizes the data through `summarizer-core.js`.
6. The popup generates either:
   - a local rule-based summary, or
   - a provider/proxy summary with local fallback on failure
7. The popup displays:
   - operational digest
   - structured findings
   - evidence and validation
   - attachment facts
   - review warnings and confidence
8. The user may copy or export approved outputs.
9. The user may optionally post an explicitly reviewed Trello comment draft.
10. The popup saves private ledger history, review state, export records, and feedback records.

## Required Honesty Rules

- Attachment contents must not be claimed as read unless text was actually extracted.
- Sensitive-card gating must keep attachment extraction and provider handoff limited until approval is granted.
- Trello comment posting must stay opt-in and approval-gated.
- Batch processing requires explicit AI-handoff approval; its outputs remain review-required and it must not write to Trello cards.
- Card description writeback is not part of the current critical path.
- AI summaries must separate facts, inferences, uncertainty, and unsupported claims.
- Model-reported facts, inferences, uncertainty, and unsupported claims are displayed separately from source-derived card evidence and require human review.
- Confidence is a review signal, not a measured correctness guarantee.

## Source Files

- `connector.js`
- `popup.html`
- `summarizer-core.js`
- `card-intelligence-ledger.js`
- `attachment-processor.js`
- `ai-providers.js`
- `trello-integration.js`
- `trello-config.js`

## Phase 115 Smoke-Test Outcome

The local repo can verify the shared logic and popup contract text through `npm test`.

Automated verification on 2026-07-23:
- `node test.js` — PASSED (2335 lines, all assertions green)
- `node backend.test.js` — PASSED
- `node doctor.js` — PASSED (30 checks)
- Core module loading — PASSED (summarizer-core, card-intelligence-ledger, attachment-processor, ai-providers, trello-integration)

The Trello-runtime portions still require manual verification:

- card button launch
- member-private storage behavior
- badge refresh behavior
- actual Trello comment posting

Previous manual verification was performed on 2026-07-12 and recorded in `docs/ACCEPTANCE_TESTS.md`.
