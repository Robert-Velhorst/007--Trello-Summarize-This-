# Architecture Decisions

Date: 2026-07-23 (Phase 004)

## Decision Record

### ADR-001: Static browser-based Power-Up as primary product

**Status:** Accepted

**Context:** The product goal is to provide AI-assisted Trello card summarization. Two architectures were considered: (a) a server-side application that processes cards on behalf of users, and (b) a browser-based Trello Power-Up that runs entirely client-side.

**Decision:** Static browser-based Power-Up. The connector, popup, and settings pages are served as static HTML/JS files. There is no required server.

**Rationale:**
- Trello Power-Up SDK is browser-first; all card data access is mediated by Trello's iframe sandbox.
- Eliminates server-side data storage risks — card content never leaves the user's browser unless the user explicitly configures a proxy or AI provider.
- Zero backend infrastructure cost for basic use.
- Member-private Trello storage for settings and ledger history provides sufficient isolation.

**Consequences:**
- AI provider calls must be made from the browser (with user's own API key) or routed through an optional user-configured proxy.
- No server-side search, aggregation, or scheduling possible without the optional backend.

---

### ADR-002: Optional lightweight Node.js backend for admin/credit tracking

**Status:** Accepted (non-critical path)

**Context:** A subset of features (admin panel, credit tracking, user management) require server-side state.

**Decision:** Provide a lightweight Node.js backend (`backend-app.js`) with a local JSON runtime store. The backend is optional and not required for the core Power-Up.

**Rationale:**
- Allows local development and testing of admin features without database provisioning.
- Clearly separates shipped Power-Up scope from backend scope.
- A local JSON store keeps development setup simple without requiring database provisioning.

**Consequences:**
- Backend is not production-safe without: persistent DB hardening/migrations, TLS, stronger admin credential handling, and production-grade rate limiting/operations.
- All production blockers are documented in `docs/ROADMAP_AND_BLOCKED_ITEMS.md`.

---

### ADR-003: Cloudflare Worker proxy as optional AI relay

**Status:** Accepted (optional path)

**Context:** Some users cannot expose their API keys in browser code. A proxy allows server-side key storage.

**Decision:** Reference implementation as a Cloudflare Worker in `proxy/cloudflare-worker.mjs`.

**Rationale:**
- Cloudflare Workers are low-cost, globally distributed, and fit the static-first philosophy.
- Proxy is optional — users can choose direct keys, proxy, or built-in local analysis.

---

### ADR-004: UMD module format for summarizer-core.js

**Status:** Accepted

**Context:** `summarizer-core.js` must run in both the browser (via `<script>` tag) and Node.js (for testing).

**Decision:** Use UMD (Universal Module Definition) export pattern.

**Rationale:** No bundler required. Enables `require('./summarizer-core')` in Node tests and `window.SummarizeThis` in browser.

---

### ADR-005: No automated Trello writes without explicit human approval

**Status:** Accepted (safety boundary)

**Context:** The product can generate Trello comment drafts. Auto-posting without review is a safety risk.

**Decision:** All Trello writes (comment post, future description writeback) require explicit human approval in the popup UI before execution.

**Rationale:** Aligns with the "human operator in the loop" requirement from the product brief.
