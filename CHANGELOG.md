# Changelog

## 1.1.3 - 2026-08-14

- Default backend registration to closed unless a deployment explicitly selects another mode.
- Make Windows registration single-user and local-host-only for the first owner account.
- Refuse to open the standard Windows ngrok tunnel before the local owner exists.

## 1.1.2 - 2026-08-14

- Add a Start Menu workflow for validating and saving a dedicated ngrok HTTPS domain.
- Reuse the saved domain for future tunnels and preserve it during installer upgrades.
- Warn clearly before falling back to the ngrok account's default development domain.

## 1.1.1 - 2026-08-14

- Let the Windows launcher select a safe loopback backend port when the preferred port is already used by another application.
- Pass the selected backend port through the desktop and cloud launchers so the UI and ngrok tunnel stay aligned.
- Extend Windows acceptance coverage to exercise and report the occupied-port fallback.

## 1.1.0 - 2026-08-09

### Added

- Allowlisted GitHub Pages build and deployment workflow.
- PostgreSQL 17 persistence with bounded pooling, health checks, revision protection, and writer exclusion.
- Backend health, account registration, sign-in, sign-out, and private session handling in Power-Up settings.
- Explicitly reviewed summary persistence and per-summary HAI approval.
- Per-user HAI JSON feed with one-time token display, HMAC-only storage, cursoring, rotation, and revocation.
- Standalone Node 22 Windows backend, generated ACL-protected secrets, optional ngrok launcher, and install/uninstall acceptance tests.

### Fixed

- Included `trello-config.js` and `authorize.html` in every static and installer payload.
- Removed duplicate Trello runtime configuration and aligned the public application key.
- Removed settings debug logging that exposed provider and backend credentials.
- Fixed loopback backend URL normalization for the installed app.
- Deferred attachment parsing until text extraction is enabled.
- Prevented generated directories from inflating resource measurements or entering source control.

### Security

- Added owner isolation and explicit approval to the HAI feed.
- Restricted HAI source links to clean Trello card URLs.
- Kept unsupported payment, webhook, provider-backend, and service-control actions fail-closed.
- Verified zero npm dependency advisories and non-root Docker packaging.
