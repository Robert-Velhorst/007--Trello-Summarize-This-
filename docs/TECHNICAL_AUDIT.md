# Technical Audit

Date: 2026-07-23 (Phase 115 update)
Previous: 2026-07-10

## Active Product Surface

The current shipped product is the static Trello Power-Up flow built around:

- `connector.js` — Power-Up connector with card-buttons, card-detail-badges, show-settings, authorization-status, and show-authorization capabilities. Error boundaries added in Phase 115.
- `popup.html` — Main analysis popup. Handles card context, AI/local summary generation, confidence display, review, export, feedback, and ledger history.
- `settings-powerup.html` — Settings panel for provider keys, proxy config, output mode, language, generation settings, and export preferences.
- `summarizer-core.js` — Shared summarization and normalization logic (UMD). Provides local rule-based analysis, AI prompt generation, list planning, batch analysis, budget tracking, timing records, and version checking.
- `card-intelligence-ledger.js` — Ledger history management, analysis run recording, export tracking, and review state.
- `attachment-processor.js` — Attachment metadata handling and bounded text/CSV extraction.
- `ai-providers.js` — Provider abstraction for OpenAI, Anthropic, Google, and proxy fallback.
- `trello-integration.js` — Trello REST API integration layer with error sanitization.
- `proxy/cloudflare-worker.mjs` — Optional Cloudflare Worker proxy for AI calls.
- `local-dev-server.js` — Static file server for local development. Hardened with CORS, security headers, and graceful shutdown in Phase 115.
- `backend-app.js` / `backend-server.js` / `backend-config.js` — Backend API with a local JSON runtime store, user auth, admin panel, credit system, and summarize endpoint. Hardened with security headers and CORS in Phase 115.

This surface supports:
- Card analysis with evidence and validation display
- Optional provider/proxy AI calls with local fallback
- Export/copy flows (markdown, JSON, Trello comment draft, VA handoff, change brief, decision packet)
- Review state and feedback capture
- Member-private history and ledger storage
- Batch analysis plan generation (manual-first)
- Budget tracking and cost records
- Runtime timing records

## Phase 115 Verification Results

- `node test.js` — **PASSED** (2335 lines of contract-style assertions)
- `node backend.test.js` — **PASSED**
- `node doctor.js` — **PASSED** (30 checks including core module loading, Node.js version, docs existence)
- Core modules load successfully: summarizer-core, card-intelligence-ledger, attachment-processor, ai-providers, trello-integration

## Verified Current Strengths

- Trello card button, settings popup, auth status, and confidence/review badges are wired in `connector.js` with error boundaries.
- The popup runtime fetches card, board, list, comments, activity, attachments, and custom fields where available.
- The popup falls back to the built-in local summarizer when no provider is configured or when provider/proxy execution fails.
- Attachment handling is honest: attachment metadata is always available when Trello exposes it, bounded text/CSV extraction is optional, and binary files remain metadata-only in the shipped flow.
- Trello comment posting is approval-gated.
- Review, feedback, export history, and ledger history are stored privately rather than written into shared card fields by default.
- Local dev server now includes security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy) and graceful shutdown.
- Backend API now includes security headers and CORS preflight handling.

## Partial Areas

- PDF, Word, Excel, and image OCR extraction are partial only. The repo contains framework code and legacy stubs, but the shipped Power-Up treats these as metadata-only.
- Batch support is manual-first. The popup prepares reviewed queues and handoff material, but does not perform unattended full-card batch execution.
- Proxy mode is implemented as an optional path, but requires external deployment and credentials.
- Backend/admin subsystem exists and is functional with a local JSON runtime store, but is not verified as production-grade. User passwords use salted hashes; no production database or production-grade authentication system exists.
- `DATABASE_URL` does not activate a PostgreSQL backend. The backend explicitly supports only the local JSON store and rejects an explicit non-local store request, avoiding a false persistence claim.

## Inactive Or Disconnected Areas

These files exist in the repo but are supplementary or test-oriented, and are **not part of the current shipped Power-Up claim**:

- `database-user.js` — Requires undeclared pg dependency
- `connection.js` — Requires undeclared pg dependency
- `adminApi.js` — Requires undeclared axios dependency
- `analytics-dashboard.js`, `analytics-framework.js`, `credit-usage-analytics.js`, `feature-adoption-tracker.js` — Analytics modules not integrated into shipped flow
- Load test files (`k6-load-tests.js`, `comprehensive-load-test.js`, `api-benchmarks.js`, etc.)
- `index.html` — Standalone demo page, not the Power-Up entry point

These areas should be treated as non-active until they are made runnable, tested, documented, and explicitly reintroduced into the product surface.

## Key Risks

- Historical docs may still be mistaken for current completion evidence if readers skip the audit documents.
- Manual Trello runtime behaviors still need human verification because they cannot be fully automated in the local test harness.
- Confidence remains a review signal, not a measured correctness guarantee.
- Backend stores salted user password hashes in its local file-backed store, but it is still not production-safe because admin auth depends on environment credentials and the subsystem lacks production infrastructure hardening.

## Recommended Scope Baseline

For current truthfulness, completion claims in this repository should be limited to the static Power-Up flow plus the optional proxy reference implementation plus the lightweight local backend for development.
