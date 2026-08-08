# Data Reconciliation And Repair

Date: 2026-08-08

Reconciliation detects duplicate normalized user emails, orphan sessions, orphan user-owned records, missing workspaces, and missing owner memberships.

Dry-run is the default:

```powershell
npm.cmd run backend:reconcile
```

Apply repair only while the backend is stopped:

```powershell
node backend-cli.js reconcile --apply
```

For a running backend, use `POST /api/admin/data/reconcile` with `{ "apply": false }` first and then repeat with `{ "apply": true }` after reviewing the issue list. Apply mode removes orphan records, creates missing workspace ownership records, persists once, and runs a second dry verification. Duplicate emails remain visible for human resolution rather than merging identities automatically.
