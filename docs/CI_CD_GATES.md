# CI/CD Quality Gates

Updated: 2026-10-23

## CI Pipeline

File: `.github/workflows/ci.yml`

### Triggers
- Every push to any branch
- Every pull request targeting `main`

### Jobs

**Job 1: test** (Node 24.22.1 and 26.12.1 matrix)
1. Pin npm 12.2.1, `npm ci --omit=dev --prefer-offline`, then audit runtime and packaging dependencies from the full lock.
2. `node test.js` — core logic and popup contract tests
3. `node backend.test.js` — backend API contract tests
4. `node adversarial.test.js` — adversarial, isolation, path traversal tests
5. `node doctor.js` — self-diagnostics (current required-file and operations checks)

The job also runs static packaging, local-server boundaries, frontend session revocation, worker lifecycle, HTTP error containment, queued PostgreSQL snapshots, transfer protection, operations, E2E, large datasets, PostgreSQL persistence and labeled evaluation. PostgreSQL 18.6 runs in the CI service. A dedicated runtime-policy test rejects unpatched/odd/prerelease Node versions.

**Job 2: lint-docs**
1. Verify all 17 required documentation files exist
2. Verify no overclaiming patterns in key documents (no "99.9% accuracy" etc.)

**Job 3: container** builds the production backend image, including stable Alpine package updates.

**Job 4: windows-installer** builds the packaged backend and installer, verifies embedded Node 26.12.1+, startup/resource probes and the payload, and exercises install/uninstall in the hosted runner. Local compilation is not proof of hosted install/uninstall or operator acceptance.

### Gate Policy

| Check | Gate behavior |
|---|---|
| node test.js | BLOCK merge on failure |
| node backend.test.js | BLOCK merge on failure |
| node adversarial.test.js | BLOCK merge on failure |
| node doctor.js | BLOCK merge on failure |
| Required docs check | BLOCK merge on missing docs |
| No-overclaiming check | BLOCK merge on overclaiming |

### What CI Does NOT Check

- Live Trello API calls (requires external account)
- Live AI provider calls (requires external API keys)
- Production deployment (manual step)
- Browser rendering (requires browser automation setup)

## Manual Pre-Merge Checklist

Before merging any PR to `main`:
- [ ] All CI jobs green
- [ ] `npm run doctor` passes locally
- [ ] Changes do not introduce hardcoded credentials
- [ ] New docs are added to the docs integrity check list if required
- [ ] `docs/PHASE_STATUS_LEDGER.md` updated if a phase status changed
- [ ] `docs/CODEX_WORKLOG.md` entry added for significant changes

## Release Gate

Before tagging a release:
- [ ] `npm run test:all` passes on clean checkout
- [ ] `update.json` version matches `SummarizeThis.APP_VERSION`
- [ ] `docs/FINAL_VERIFICATION_REPORT.md` updated
- [ ] Windows installer scripts updated if runtime files changed
