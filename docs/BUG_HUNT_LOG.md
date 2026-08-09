# Bug Hunt Log

Date: 2026-08-09

## Confirmed Repo-Level Findings

1. Seven unreferenced root files were invalid JavaScript or literal inherited placeholders.
2. Persistent rate limits rewrote the complete local or PostgreSQL state for every auth or feed request.
3. The Windows static launcher could serve private installer files from its installation directory.
4. Windows upgrades attempted to overwrite a running backend and could reapply ACLs in a way that required an unavailable privilege.
5. The HAI feed did not satisfy both HAI JSON reader contracts.
6. Standalone Windows pages downloaded the Trello SDK even though they do not use it.
7. Historical docs still described PostgreSQL as unsupported after the production store had been implemented.

## Current Handling

- Invalid unreferenced files were removed; all remaining tracked JavaScript parses.
- Rate limits use a bounded in-memory fixed-window cache and fail closed at the cardinality cap without rewriting durable state.
- The Windows launcher serves only the 24-file runtime allowlist; private settings, data, executable, PID, and scripts return 404.
- Upgrade acceptance proves the exact backend process is stopped, credentials and data are preserved, current-user-only ACLs remain exact, and uninstall succeeds.
- A generated feed is accepted by both HAI's account-feed parser and Connected Sources import shape.
- The Trello SDK loads only inside an iframe; standalone mode skips the request.
- PostgreSQL 17 persistence, restart, and single-writer exclusion are covered in the full suite.
