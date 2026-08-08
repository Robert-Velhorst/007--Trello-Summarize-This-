# Backup And Restore

Date: 2026-08-08

Local snapshots are private JSON files stored beside the runtime database under `backups/`. Creation writes the snapshot with exclusive-create semantics, validates its schema, records its SHA-256 digest, and retains the newest 20 snapshots.

## Live Admin API

```text
POST /api/admin/backup/create
GET  /api/admin/backup/list
POST /api/admin/backup/:id/restore  { "confirm": true }
```

Restore verifies the recorded digest and schema. It first creates a safety snapshot of current state. Missing confirmation, unknown backups, digest mismatch, and unsupported schema versions fail closed.

## Offline CLI

Stop the backend first because the runtime lock intentionally rejects concurrent CLI access.

```powershell
npm.cmd run backend:backup -- "before upgrade"
node backend-cli.js restore backup_ID --confirm
```

These are local recovery controls, not offsite disaster recovery. A production operator must separately configure encrypted offsite copies, retention policy, access review, and a restore drill.
