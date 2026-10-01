# Hetzner Migration Verification

Last checked: 2026-10-01. These are local and GitHub CI checks, not proof of a deployed service.

## Passed

- Summarizer and backend contract tests: `npm.cmd test`.
- Complete `npm.cmd run test:all` suite passed with `TEST_DATABASE_URL` set to a disposable PostgreSQL 17 instance, including persistence and exclusive-writer checks, end-to-end, large-dataset, adversarial and labeled evaluation tests.
- Operations tests: `node operations.test.js`.
- Backend Docker image built successfully with the transfer module included.
- Base Compose configuration validates without `APP_DOMAIN` when required secrets are supplied.
- Hetzner Compose overlay configuration validates with example configuration.
- Import into an isolated PostgreSQL 17 database, store close and reopen, and comparison of all non-metadata fields passed.
- Import tests verify checksum enforcement, preservation of source data, duplicate rejection, refusal to overwrite existing data or configured settings, and rollback on persistence failure.
- Import rejects nested `__proto__` fields before migration and structures deeper than the supported 128-level traversal limit. The validator uses an iterative traversal, avoiding recursive call-stack exhaustion.
- Disposable test database and network were removed; unrelated containers were not changed.

## Not Yet Verified

- Authenticated shell access and inventory of existing server workloads. SSH reaches the server but rejects authentication.
- Production hostname, DNS and public HTTP/HTTPS ingress.
- Production secrets, installation, TLS certificate issuance and renewal.
- Transfer of the real Windows store and separate backup files.
- Existing-account login, retained summaries, Trello backend configuration and HAI behavior against the hosted service.
- Final cutover and retirement of the temporary tunnel.

Keep the existing Windows data authoritative until a checksum-verified transfer and live acceptance checks pass. No production data, firewall rules, DNS records or Trello settings were changed during these checks.

## HAI Regression Checks

Three additional regressions were reproduced against the HTTP handler and fixed on 2026-10-01:

- Mixed-case and punctuation-bearing IDs sharing an approval timestamp caused cursor pagination to omit records. Feed sorting now uses the same ordinal string comparison as cursor filtering. A one-record-per-page test verifies every tied record is delivered exactly once.
- Concurrent token creation for different users overwrote one user's newly issued capability. Token rotation and revocation now mutate the current collection inside synchronous store transactions, without replacing it with a stale read snapshot. Tests verify concurrent creation preserves both users' capabilities and concurrent revocation invalidates both.
- The feed measured plain JSON before HTML-safe escaping, allowing the final response to exceed its 1.5 MiB limit. It now counts bytes using the same encoding as the response writer, builds only the prefix fitting the budget, and advances the cursor only through delivered records. Tests use large escapable text and multibyte emoji, verify actual response bytes, and paginate through all records without loss. A single oversized record returns an explicit 422 rather than advancing past it.

The complete local suite passed again after these changes. In this later invocation `TEST_DATABASE_URL` was unset, so its PostgreSQL integration test was explicitly skipped; the earlier real PostgreSQL checks remain separate evidence. Docker and Windows packages were rebuilt after the HAI fixes. The inspected Windows payload's backend SHA-256 matches the rebuilt backend executable, and its file list matches the runtime manifest plus installer scripts. Live ingestion by the actual HAI service is still unverified.

## Local Server and Frontend Session Checks

Checked on 2026-10-01:

- The repository's Node development server now serves only paths listed in `runtime-files.json`, instead of arbitrary repository files. Real loopback HTTP tests verify runtime pages/assets still load and environment files, Git configuration, backend source, dependency files and runtime-store paths return 403, including encoded-path requests.
- Non-GET/OPTIONS methods return 405. Non-regular runtime entries are refused, and stream errors are handled without an unhandled error event.
- The Windows root-path bug was reproduced as a 404 for `/` and fixed; a live HTTP test now gets the index page successfully.
- The actual frontend logout function is exercised in an isolated JavaScript context. Tests reproduced missing remote revocation when a saved token existed but the input had been cleared, and now verify revocation is attempted for both saved and visible tokens. Local secrets are cleared even if the backend request fails.
- The expanded full suite passed. Its PostgreSQL test was explicitly skipped in this invocation because no test database URL was supplied; prior database tests are separate evidence.
- The Windows installer was rebuilt after the logout fix. Its inspected payload contains the current settings page and the expected manifest files. Installed-app/browser behavior remains unverified; these logout tests are function-level, not live Trello acceptance.

## Worker Lifecycle Checks

Checked on 2026-10-01 with `worker-runtime.test.js`:

- Integrated and standalone workers use the same finite interval normalization. Invalid, nonpositive or nonfinite values fall back to 5 seconds; positive values are clamped to 1 second through Node's supported maximum timer delay. This prevents malformed or overflowing configuration from turning into rapid polling.
- An occupied loopback TCP port produces `EADDRINUSE`; the opened store is closed exactly once, without scheduling or running the worker before listener readiness.
- Integrated shutdown stops future cycles, awaits an active cycle, then closes the store and releases the runtime lock. Repeated shutdown requests share one promise. The executable's signal handlers await this shutdown path instead of exiting from the HTTP close callback before cleanup finishes.
- Standalone worker termination wakes an idle wait or lets an active cycle drain. It closes the store before releasing its lock and does not forcibly exit mid-cycle.
- Lifecycle tests exercise the current source with controlled store/worker dependencies and a real occupied TCP listener. They do not prove production PostgreSQL failure recovery or installed Windows signal behavior.
- The full suite passed again after these lifecycle fixes; PostgreSQL was explicitly skipped in this invocation. Windows backend and installer packages were rebuilt, and the inspected installer backend matches the rebuilt executable by SHA-256.
- The first Docker build failed while fetching Node base-image metadata from Docker Hub. A retry after that build had terminated completed successfully.

## Full HTTP and PostgreSQL Integration

Checked on 2026-10-01 against a disposable PostgreSQL 17 instance:

- `npm.cmd run test:all` passed with `TEST_DATABASE_URL` configured. Transfer, PostgreSQL persistence/exclusive-writer tests and the HTTP E2E test actually used PostgreSQL rather than skipping it.
- The expanded HTTP E2E test uses a real loopback backend and its integrated worker. A user-approved batch is processed automatically into review-required status without directly invoking the worker from the test.
- Reviewed-summary saving, HAI capability issuance and feed reads passed. Non-approved summaries and another user's approved summaries are excluded from the owner's feed.
- A clean backend shutdown and restart against the same store preserves the owner's session, connector capability, delivered content and cursor. Revoking approval removes the record from the feed; logging out invalidates the session.
- The same expanded E2E scenario also passed against local-file storage.
- Provider credentials and proxy configuration are disabled in the synthetic E2E process. HTTP requests have a 10-second deadline. No real Trello or HAI-consumer request was sent.
- Each PostgreSQL E2E run uses a uniquely named temporary table. After all checks the disposable database had zero public tables, confirming test-table cleanup.

These checks improve local integration evidence. They are not proof of Hetzner deployment, public TLS, the Trello iframe, an installed Windows application or ingestion by the actual HAI consumer.

## PostgreSQL Serialization Optimization

Checked on 2026-10-01:

- PostgreSQL persistence now queues one immutable serialized state string instead of cloning through JSON and serializing again.
- `postgres-snapshot.test.js` verifies that a delayed first write and queued second write retain distinct captured values and use ordered optimistic revision numbers, despite later changes to in-memory state.
- The reproducible synthetic persistence benchmark compares the actual method against Git revision `c4b2d44`; SQL is stubbed. Its measured scope and observed timings are documented in `RESOURCE_USAGE_ANALYSIS.md`.
- The first full PostgreSQL suite run during concurrent Docker build activity failed on a 10-second HTTP timeout at workspace-member deletion. Its root cause is not established; it must not be silently counted as a pass.
- A later full PostgreSQL suite run passed without relaxing any timeout. Import, durable reopening, automatic worker processing, HAI privacy/restart checks, exclusive-writer tests, adversarial checks and evaluation checks all passed on the optimized implementation.
- Windows backend and installer were rebuilt after the optimization. Live resource utilization on Hetzner and sustained-load latency remain unmeasured.

## Windows Packaging Cross-Check

- `npm.cmd run build:windows-backend` produced the backend executable. The packager warned that the default local runtime store file does not exist in this clean worktree; no real store was supplied for packaging.
- Fixed installer hashing to use streaming .NET SHA-256 without depending on the availability of PowerShell's `Get-FileHash` command.
- Installer build staging now uses a unique, path-checked temporary directory per build.
- `npm.cmd run test:windows-payload` completed and produced `dist/windows-installer/SummarizeThisSetup.exe` (22,041,600 bytes after the HTTP error-containment fix).
- The inspected payload exactly matches the static runtime manifest plus the four launcher/install scripts and packaged backend executable.
- The generated installer is unsigned. This is not a signed Windows release.
- Execution of the packaged backend for a runtime smoke check was rejected by the execution policy before it ran. Installation, first launch and installed-backend behavior remain unverified in this pass.

## Independent GitHub CI Acceptance

Commit `9f562519cd7126992029e933cab14399a7a7e48d` passed the [pull-request CI run](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-/actions/runs/36853320469) on 2026-10-01. The separate push-triggered run also passed.

- Node 20 and Node 22 ran the full set of regression gates against PostgreSQL 17, including the new transfer, worker-lifecycle, frontend logout, local-server and immutable-snapshot tests.
- Container build and documentation integrity gates passed. The separate [CodeQL workflow](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-/actions/runs/36853320456) completed successfully; this is not a guarantee that no vulnerabilities remain.
- The packaged backend executable actually started and answered 100 health requests on the GitHub Windows runner.
- Installer payload verification, installation, installed backend startup, default-port collision avoidance, private-file access restrictions, current-user-only settings/data ACL checks, upgrade with retained account data and settings, and uninstall passed.
- The installation test invokes the extracted `install.ps1` payload. It does not simulate a person double-clicking the installer wrapper, SmartScreen interaction, or Trello's iframe on Robert's Windows 11 computer.
- The installer artifact was uploaded by CI and remains unsigned. No production Windows data was used or changed by these isolated runner tests.

This adds independent runtime evidence beyond the locally blocked executable smoke check above. It does not resolve the production SSH, domain, deployment, transfer, Trello or HAI-consumer acceptance gaps.

## HTTP Error Containment

Checked on 2026-10-01 with `backend-http-error.test.js`:

- A controlled synchronous handler failure reproduced an exception escaping the HTTP callback before the fix. Handler invocation now happens inside the promise boundary, covering both immediate throws and rejected promises.
- The last-resort handler returns a generic, non-cacheable JSON 500 only while headers remain unsent. A partially sent response is destroyed instead of attempting to write a second response; closed or ended responses are left alone.
- Unexpected exception messages are not printed by this last-resort handler, avoiding credential disclosure through that log path.
- Tests exercise the current server source with controlled application dependencies and a real loopback HTTP listener. They verify a failed response, interruption after actual headers have arrived, rejection of the incomplete body, and a successful subsequent request to the same server.
- The complete local suite passed after the runtime fix, with PostgreSQL explicitly skipped because `TEST_DATABASE_URL` was unset. The new test is also included in the Node 20/22 GitHub gates; their result for this later code change must be checked independently of the earlier acceptance run.
- The Windows backend and installer were rebuilt after the fix. The inspected installer's packaged backend SHA-256 matches the rebuilt executable.

These checks cover the outer server boundary, not every route's behavior under every possible database or network failure.

## HAI Consumer Source Compatibility

Checked on 2026-10-01 with `tools/verify-hai-consumers.js` against the locally available HAI backend checkout:

- The actual Summarize This loopback HTTP E2E scenario generated a synthetic approved-summary feed and an empty continuation page. Private and other-owner summaries remained excluded, and the terminal page retained its cursor.
- The actual HAI account-feed parser accepted those responses. The actual Connected Sources `ImportItem` and `jsonFeedEnvelope` declarations decoded the same responses, with matching IDs, content, titles, links, item types, projects and cursors.
- Negative probes confirmed that the account-feed parser rejects an unsupported provider and Connected Sources rejects object-valued metadata. Summarize This omits metadata to satisfy both representations.
- The tool extracts declarations using Go's AST and reports the four source snapshots' SHA-256 values. HAI's checkout is not modified. Consumer operation conversion, network policy, source normalization and database ingestion are not executed.
- The first attempt failed before running the parser because Docker's temporary mount was not executable. The corrected isolated-container run passed; the initial attempt is not counted as a pass.
- The default local suite passed again; PostgreSQL was explicitly skipped in that invocation. The optional cross-repository check uses a separate synthetic local store even if a test database URL is present in the parent environment.

Captured source fingerprints for the passing probe:

| HAI Source | SHA-256 |
|---|---|
| `internal/accountfeed/generic_feed.go` | `5e8319ee4393c14f07a62cb3dbe6cbd8d3c235dd37c2e7cfc0186210e44a6d2d` |
| `internal/accountfeed/enum.go` | `c024a3d2b2bfab00082d71c319f7fc9aefd289dea50cea1d5bc68c8cf834c7e9` |
| `internal/accountfeed/bridge.go` | `77a693b98a2102d7f3eb1918ee05aa935f07ba6d3b43358c076515b47520d392` |
| `internal/source/service.go` | `1d0be508e46be2dfa3f78ed345b3add69696a312ae6a08522c4ea187b5283e15` |

This is independent source-level compatibility evidence, not a live HAI connection. Capability/approval revocation prevents future reads but does not delete data HAI already imported.
