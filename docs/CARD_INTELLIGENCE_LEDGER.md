# Card Intelligence Ledger

Date: 2026-06-29

## Status

The first working ledger slice is implemented in `card-intelligence-ledger.js` and wired into the active `popup.html` runtime.

## What It Adds

- `CardSnapshot`: compact card state at analysis time, using a description hash instead of storing the full description.
- `AnalysisRun`: provider/model metadata, input hash, timing, structured result, and audit event.
- `EvidenceClaim`: summary claims linked to card title, description, list, due date, checklist, comment, activity, attachment, label, member, or custom-field evidence.
- `Blocker`: explicit and implied blockers from card text, missing context, overdue state, low checklist progress, and attachment extraction limitations.
- `StaleActivity`: deterministic inactivity signal based on Trello `dateLastActivity`, comment dates, or activity dates. Cards with no visible activity for 14+ days are aging; 30+ days becomes a stale-activity blocker, validation finding, confidence penalty, trust warning, and review question.
- `WaitingOn`: explicit waiting states, external replies, approvals, missing input, and dependency signals that block movement.
- `NextAction`: extracted next steps plus open checklist items.
- `DecisionItem`: Robert-specific approval or Yes/No decision candidates.
- `VA/team-ready action`: delegate-ready actions that do not require Robert approval.
- `UnclearPoint`: contradictions, ambiguous instructions, status conflicts, or inconsistent AI/validation signals that should be resolved before acting.
- `UnresolvedQuestion`: open questions derived from AI output, missing information, blockers, waiting states, unclear points, validation findings, and Robert decisions.
- `ValidationFinding`: missing context, attachment metadata-only state, weak next actions, and decision review signals.
- `ReviewRecord`: private analysis review state such as reviewed, accepted, or needs follow-up.
- `HumanFeedback`: private correction/rating records, including the specific output sections the user marked wrong or incomplete.
- `ExportRecord`: private copy/export history.
- `SettingsProfile`: output mode, output language, plus custom-guidance presence/hash metadata for the prompt used by a run.
- `SourceCoverage`: compact visible status for card fields, board/list context, members, labels, due date, checklists, comments, activity, attachments, and custom fields.
- `Activity`: compact recent non-comment Trello action metadata when available.
- `AttachmentMetadata`: compact attachment name/type/category/status records for documents, transcripts, recordings, spreadsheets, presentations, images, links, and generic files.
- `AttachmentTextPreview`: optional bounded text excerpt from small HTTPS text-like attachments when the member enables text/CSV extraction in settings.
- `CustomField`: compact normalized custom field name/value/type metadata when Trello exposes custom field items.
- History comparison: source-data, description, checklist, comment, attachment, blocker, waiting-state, unclear-point, decision, VA action, and confidence changes between runs.
- Operational AI schema: providers are prompted to return blockers, waiting-on items, next actions, Robert decisions, VA-ready actions, missing information, unclear points, unresolved questions, evidence claims, validation findings, and confidence reasons directly.
- Operational item display: popup lists and human-readable exports preserve compact owner, priority, severity, risk, category, Robert-required, and delegation metadata where available.
- Ledger export formats: the popup can copy markdown, plain text, status/email text, copy structured JSON, and download compact JSON for Sneup/HAI-style ingestion.
- Trello comment approval: the popup generates an exact comment draft, supports copy-only use, and only attempts Trello posting after the user checks an approval box and confirms the action.
- Export/postback history: the popup shows recent private export, copy, download, and Trello comment records for the current card's analysis runs.
- Review state: the popup lets the user privately mark an analysis reviewed, accepted, or needing follow-up.
- Trello card badge: the connector reads the latest private ledger run for the current card and shows setup-needed, review-needed, failed-analysis, or confidence status without writing to shared card data.

## Storage

The active popup stores ledger history, feedback, and export records in Trello member-private Power-Up storage:

- `summarizeThisLedgerHistory`
- `summarizeThisReviewRecords`
- `summarizeThisFeedback`
- `summarizeThisExportRecords`

Local preview mode uses `localStorage` for the same non-secret ledger keys. Provider API keys are not persisted in local preview: settings strips `apiKeys`, clears key fields after save, requires a valid proxy endpoint for AI-only local preview, and cleans older local preview data that still contains keys. The optional proxy setting stores only a normalized endpoint, not provider keys. The popup no longer silently writes the latest analysis into shared card storage.

Feedback records remain compact. Correction text is capped, and `incorrectSections` stores only section ids such as `blockers`, `waiting-on`, `next-actions`, `robert-decisions`, `va-team-actions`, `unclear-points`, `evidence-validation`, and `unresolved-questions`. Prior feedback is included in later prompts as correction guidance only, not as verified card evidence.

## Current Limits

- The history UI shows the current run, recent previous runs, change summary, confidence trend, and copy controls for older runs.
- The review-state UI shows whether the current analysis has been reviewed, accepted, or marked for follow-up.
- The export history UI shows recent copy/download/postback records filtered to the current card's analysis run ids.
- The Source coverage UI shows available, partial, missing, and failed source reads so missing comments or metadata-only attachments are explicit.
- Custom prompt guidance is stored member-private in settings. Ledger runs and JSON exports record only a presence flag, character count, and short hash, not the full guidance text.
- Output language is stored as compact `en` or `nl` metadata. AI prompts use it as a user-facing language instruction, and the built-in local summarizer uses it for local-mode and sensitive-fallback summaries while keeping JSON field names stable.
- Custom fields are included as compact evidence and AI prompt context when available.
- Recent activity is included as compact non-comment action evidence when available, capped to 25 stored items and 12 prompt/evidence items.
- Stale-activity detection uses only activity timestamps and does not read more Trello content or call an AI provider.
- Attachment evidence is honest about metadata-only extraction and now classifies linked documents, transcripts, and recordings from metadata.
- Optional text/CSV extraction is off by default. When enabled, the popup fetches only small HTTPS text-like attachments, stores bounded excerpts, and includes compact previews in evidence and AI prompt context. Sensitive-card signals keep those attachments metadata-only until the user approves the sensitive run.
- Deeper PDF/Word/image/audio/video extraction still needs a safer extraction path.
- JSON export uses the compact ledger run and card snapshot. It does not include full card descriptions, but evidence excerpts may still contain card context selected by the analysis.
- Human-readable exports now include bounded evidence-backed claims and source coverage, so copied markdown/plain text/status briefs and Trello comment drafts remain traceable outside the popup.
- Trello comment writeback is capability-dependent. If the Trello Power-Up runtime does not expose a supported comment API, the popup remains copy-only.
- Trello description replacement uses a reviewed editable draft, explicit approval and confirmation, a source-freshness check, and private pending/ambiguous/update attempt tracking. Live Trello verification is still required before production use.
- The ledger still keeps deterministic extraction as a fallback when an AI provider omits structured operational fields.
- Unclear-point detection is intentionally conservative. It catches explicit contradictions, validation conflicts, and deterministic status conflicts such as a due date marked complete while checklist items remain open, but deeper semantic contradiction detection still depends on the configured AI provider.
