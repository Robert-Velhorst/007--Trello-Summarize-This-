# CI/CD Quality Gates

Date: 2026-07-23 (Phase 068)

## CI Pipeline

File: `.github/workflows/ci.yml`

### Triggers
- Every push to any branch
- Every pull request targeting `main`

### Jobs

**Job 1: test** (Node 20.x and 22.x matrix)
1. `npm ci --prefer-offline` — install dependencies
2. `node test.js` — core logic and popup contract tests
3. `node backend.test.js` — backend API contract tests
4. `node adversarial.test.js` — adversarial, isolation, path traversal tests
5. `node doctor.js` — self-diagnostics (current required-file and operations checks)

**Job 2: lint-docs**
1. Verify all 14 required documentation files exist
2. Verify no overclaiming patterns in key documents (no "99.9% accuracy" etc.)

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
