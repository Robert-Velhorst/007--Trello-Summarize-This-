# Worker Operations

Date: 2026-08-08

## Runtime Model

The supported server configuration is one backend process with `RUN_WORKER=true`. The worker shares the backend store instance, checks due reminders, and leases explicitly approved `local-worker` batch jobs. A runtime lock prevents a second backend, standalone worker, or operator CLI from opening the same store.

The worker never fetches Trello content, uses provider credentials, or writes to Trello. Every card must include at least 50 characters of explicit source text. Successful output stops at `review-required`.

## Commands

```powershell
$env:JWT_SECRET="replace-with-32-or-more-random-characters"
$env:ADMIN_PASSWORD="replace-with-12-or-more-random-characters"
$env:RUN_WORKER="true"
npm.cmd run start:backend
```

Offline single cycle, only while the backend is stopped:

```powershell
npm.cmd run worker:once
```

## Recovery

- `retry-wait` uses exponential backoff and a bounded maximum of five attempts.
- Expired leases are eligible for another cycle.
- Missing explicit text is `blocked`, not guessed or fetched.
- Terminal failures appear in `GET /api/admin/exceptions`.
- Never delete a runtime lock until the recorded process is confirmed stopped. Stale locks are removed automatically when their PID is no longer active.
