# Release Process, Canary, and Rollback

Date: 2026-07-23 (Phase 069)

## Release Types

| Type | Scope | Trigger |
|---|---|---|
| Patch | Bug fixes, doc updates | Manual tag on `main` |
| Minor | New features, new modes | Manual tag on `main` |
| Major | Breaking changes, protocol changes | Manual tag on `main` after RC period |

## Release Steps

1. **Verify tests pass:** `npm run test:all && node doctor.js`
2. **Update version:** Bump `SummarizeThis.APP_VERSION` in `summarizer-core.js`
3. **Update `update.json`:** Set `version` to match APP_VERSION
4. **Update changelog:** Add entry to `docs/VERSIONING_AND_CHANGELOG_DISCIPLINE.md`
5. **Update `docs/FINAL_VERIFICATION_REPORT.md`** with release date
6. **Commit:** `git commit -m "Release vX.Y.Z"`
7. **Tag:** `git tag vX.Y.Z && git push origin vX.Y.Z`
8. **Deploy static files:** Copy all `.html`, `.js`, `.json`, `.css`, `.svg` to hosting
9. **Verify deployment:** `curl https://your-host/update.json` → version matches
10. **GitHub Release:** Create GitHub release for the tag with release notes

## Canary / Staged Rollout

The static Power-Up does not support automatic canary traffic splitting. To do a staged rollout:

1. Deploy to a staging URL (e.g. `https://staging.your-host/connector.html`)
2. Test manually with a subset of Trello boards
3. If stable for 24h, deploy to production URL

## Rollback Procedure

1. Identify the last known good commit: `git log --oneline -n 10`
2. Check out the previous release tag: `git checkout vX.Y.(Z-1)`
3. Redeploy static files from that checkout
4. Verify rollback: `curl https://your-host/update.json` → shows old version
5. Update `update.json` if needed to not prompt users to "upgrade" to the rolled-back version

## Update Manifest

The `update.json` file at the repo root is the source of truth for the current version:

```json
{
  "schemaVersion": "summarize-this-update-manifest-v1",
  "version": "X.Y.Z",
  "manifestUrl": "https://raw.githubusercontent.com/Robert-Velhorst/007--Trello-Summarize-This-/main/update.json",
  "releaseNotesUrl": "https://github.com/Robert-Velhorst/007--Trello-Summarize-This-/releases/tag/vX.Y.Z"
}
```

`downloadUrl` is intentionally left empty — the Power-Up is updated by redeploying static files, not by downloading an installer (except for the Windows installer path).
