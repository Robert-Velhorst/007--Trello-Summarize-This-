# File Safety and Path Traversal Tests

Date: 2026-07-23 (Phase 047)

## Path Traversal Defense Verification

Verified in `adversarial.test.js` and `local-dev-server.js`:

1. **Path Normalization:** Request URLs undergo `path.normalize()` and URL decoding.
2. **Root Boundaries:** Any path resolving outside the application root directory (`/../../../etc/passwd`, encoded variants `%2e%2e%2f`, and sibling directories sharing the root's string prefix) is rejected with a `path.relative()` containment check.
3. **Attachment URL Filtering:** `safeAttachmentUrl()` enforces HTTPS scheme and restricts remote content fetching to trusted Trello domains.
