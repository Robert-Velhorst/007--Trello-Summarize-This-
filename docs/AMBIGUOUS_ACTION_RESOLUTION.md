# Ambiguous External Action Resolution

Date: 2026-07-23 (Phase 111)

## Resolution Protocol

1. **Explicit Review Checkbox:** Any external mutation (such as posting a Trello comment) requires explicit user confirmation via a review checkbox.
2. **Clear Action Labels:** UI buttons explicitly state the action (`Post to Trello`, `Copy Markdown`, `Save Settings`) to prevent unintended execution.
3. **Cancellation Option:** External actions can be cancelled or dismissed prior to user confirmation.
4. **Durable Exact-Draft State:** Before a reviewed Trello comment is sent, the Power-Up records a private `pending` attempt keyed by card ID and a draft hash. A confirmed response becomes `posted`; any post-send failure becomes `ambiguous`.
5. **No Blind Retry:** A `pending` or `ambiguous` exact draft is blocked from reposting. The user is told to inspect the Trello card manually and can copy the approved draft instead.
