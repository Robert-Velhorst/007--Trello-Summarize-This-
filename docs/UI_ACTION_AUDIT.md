# UI Action Audit

Date: 2026-07-23 (Phase 115 update)
Previous: 2026-07-10

## Active UI Surfaces

### connector.js — Power-Up connector

| Capability | Status | Notes |
|---|---|---|
| card-buttons | Wired | "Summarize This" button opens popup.html. Error boundary added in Phase 115 — returns empty array on failure rather than crashing. |
| card-detail-badges | Wired | Reads settings + ledger history. Shows confidence %, "Analyzed", "Review needed", "Analysis failed", or "Setup needed". Error boundary added in Phase 115 — degrades to fallback badge on failure. |
| show-settings | Wired | Opens settings-powerup.html |
| authorization-status | Wired | Returns { authorized: Boolean(token) } via Trello REST API |
| show-authorization | Wired | Opens authorize.html |

### popup.html — Main analysis popup

| Action | Status | Notes |
|---|---|---|
| Load card context | Wired | card, board, list, comments, activity, checklists, attachments, custom fields |
| Run local summary | Wired | buildRuleBasedAnalysis() always runs as fallback |
| Run AI provider summary | Wired | Via ai-providers.js — OpenAI, Anthropic, Google with local fallback |
| Run proxy summary | Wired | Via configured proxy endpoint |
| Run consensus AI | Wired | Multi-provider consensus mode |
| Display confidence and evidence | Wired | Quality score, structured findings, evidence claims, validation |
| Display AI claim boundary | Wired | Model-reported facts, inferences, uncertainty, and unsupported claims are displayed separately from source evidence and require human review |
| Display attachment facts | Wired | Category, extraction status, preview |
| Save analysis to ledger | Wired | Stored privately via Trello member-private storage |
| View ledger history | Wired | Previous runs listed with run details |
| Copy/export summary | Wired | Markdown, JSON, VA handoff, change brief, decision packet |
| Draft Trello comment | Wired | Approval-gated — requires explicit tick before post |
| Post Trello comment | Wired | Only after approval tick; exact draft attempts are privately tracked as pending/posted/ambiguous, and ambiguous outcomes block blind reposting |
| Submit feedback (rating + correction) | Wired | Stored in ledger; surfaced in next AI prompt |
| Check for updates | Wired | Manual trigger only (not auto on load); secure URL validation |
| Batch analysis plan | Wired | Generates plan from list context |
| Batch execution review | Wired | Explicit AI-handoff approval is required before controlled popup processing; results are stored as review-required and Trello writes remain off |
| Track batch progress | Wired | Progress saved privately per-card |
| Copy batch checklist | Wired | Exports manual batch checklist |
| Copy batch handoff report | Wired | Exports batch progress report |
| Copy decision packet | Wired | Exports decision handoff packet |
| Export change brief | Wired | Exports change brief from ledger run |
| List trend signals display | Wired | Privacy-bounded list metadata signals |
| List planning brief display | Wired | Neighboring card context, trend signals |

### settings-powerup.html — Settings panel

| Setting | Status | Notes |
|---|---|---|
| AI provider selection and key entry | Wired | Stored in member-private Trello storage |
| Proxy endpoint config | Wired | HTTPS-only, sanitized |
| Analysis mode (auto/local/consensus) | Wired | normalizeProviderMode() |
| Output mode (operational-ledger, status-update, etc.) | Wired | normalizeOutputMode() |
| Output language (English/Dutch) | Wired | normalizeOutputLanguage() |
| Max output tokens | Wired | normalizeGenerationSettings() |
| Default copy format | Wired | normalizeExportPreferences() |
| AI response budget limits | Wired | normalizeBudgetSettings() |
| Prompt templates CRUD | Wired | normalizePromptTemplateSettings() |
| Custom instructions | Wired | normalizeCustomInstructions() |
| List context toggle | Wired | Enables/disables list context in AI prompt |
| Save settings | Wired | Written to Trello member-private storage |

### authorize.html — Authorization flow

| Action | Status | Notes |
|---|---|---|
| Load Trello client dynamically | Wired | Reads appKey from shared config before loading |
| Authorize with Trello | Wired | Standard Trello OAuth flow |

## Hidden or Removed UI Actions

- No actions are hidden that would appear active to the user.
- No unapproved or background batch execution path exists; the reviewed popup runner only starts after explicit AI-handoff approval and keeps Trello writes off.
- `DOMContentLoaded -> checkForUpdates()` auto-trigger is explicitly absent (verified in test.js).
- Card description replacement has a dedicated editable draft, approval checkbox, final confirmation, source-freshness check, and durable pending/ambiguous outcome protection. It remains pending live Trello verification.

## Phase 115 Changes

- `card-buttons` callback now has `(t)` parameter (was `()`).
- Both `card-buttons` and `card-detail-badges` now have error boundaries that degrade gracefully.
- Badge fallback shows "Summarize This" in light-gray on unexpected errors.
