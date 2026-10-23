# Stable runtime and dependency baseline - 2026-10-23

## Changes

- Both declared packages match current npm stable metadata: pg 8.23.1 (retained, now exact) and @yao-pkg/pkg 6.24.0 (updated from 6.23.0). The refreshed lock contains zero known npm audit vulnerabilities, including packaging dependencies. Upstream prebuild-install is deprecated; it remains a transitive dependency of the latest packager.
- Patched Node floors are 24.22.1 / 26.12.1; npm is pinned to 12.2.1. CI and Pages setup use the patched targets. Active action releases are pinned to verified commits. Doctor and the packaged-backend test reject old runtimes; 12 policy boundaries plus the current runtime passed.
- The backend image pins Node 26.12.1 and refreshes stable Alpine packages. Actual runtime probes report Node 26.12.1, pg 8.23.1, musl/musl-utils 1.2.6-r3 and zlib 1.3.2-r1. npm 12.2.1 is used for dependency installation; npm and Yarn are removed from the final runtime because the application does not need them. The first image scan found CVE-2026-111997 in npm's bundled ip-address 10.7.2, despite the app lock audit being clean. Removing build tooling addresses that installed runtime exposure; no image vulnerability exception was introduced.
- PostgreSQL remains 18.6; its current official image digest is refreshed. The optional Hetzner proxy now pins Caddy 2.11.7 and its official image digest instead of floating caddy:2-alpine. Existing PostgreSQL data-volume names and migration instructions are retained. No production migration occurred.
- This includes the runtime patch also proposed in #156; that draft and its head are untouched. Review the overlap before merging either.

## Actual verification

- Full local test:all command passed under Node 26.12.1: 14 test programs passed, while the PostgreSQL program initially reported a configuration skip. The separate PostgreSQL 18.6 fixture then passed persistence, restart and writer-exclusion checks; it left zero public tables and was removed after ownership verification. The fixture used only tmpfs storage, with no host bind or named data volume.
- Doctor passed all 39 checks. Resource analysis, the new full-lock CI audit command and YAML/lock validation passed. Node 26 emits a localStorage experimental warning in existing browser-like tests; no persistent localStorage file was configured.
- The optional HAI consumer helper now pins Go 1.27.3 and its Alpine image digest. Against captured HAI main b4f4bc91206eb58be4d6f412c0829c498c9f4889, actual parser/schema code accepted the synthetic HTTP feed and empty continuation page and rejected an invalid provider, incompatible metadata and an oversized feed. It extracts HAI's actual maxFeedBytes constant from fetcher.go and preserves provider parsing; live fetchers, bridge connection status and operation conversion remain outside this existing parser-only probe. An initial harness compile failure exposed those newer source dependencies and was repaired without stubbing the parser or its size bound. The Go fixture had no network, read-only input, bounded resources and no dependency downloads.
- The updated Linux backend image built and passed actual health/readiness probes in a read-only, network-disabled container with synthetic credentials and tmpfs state. No provider was called; worker execution was disabled. The owned container was removed.
- Trivy 0.76.1 scanned the final image: 34 installed packages across Alpine and Node inventories, zero known vulnerabilities. CI now scans every built image with all severities, rejects any finding (including unknown/unfixed), and verifies OS plus actual direct runtime dependency coverage. The policy accepted the actual clean report and rejected the earlier vulnerable report; 20 malformed/incomplete/vulnerable synthetic cases also fail closed. No project ignore file is mounted into the scanner. The initial 768 MiB scanner-cache attempt failed while expanding the public database; a 2 GiB temporary cache succeeded, and the failure log is retained.
- Initial hosted checks passed both Node matrices and Windows build/install tests, but the new scanner could not read the Linux export's private file mode. CI now grants read-only access to that CI-owned image archive. CodeQL also flagged the verifier's arbitrary report-path argument; the CLI now reads only the fixed CI artifact path. Three CLI regression cases cover the fixed clean report, rejection of an arbitrary path and rejection of a vulnerable report. No alert was dismissed. New-head hosted acceptance is still required.
- Caddy's actual binary reports 2.11.7. The unchanged Hetzner Caddyfile validated in a network-disabled, read-only fixture with the same NET_BIND_SERVICE capability allowed by Compose. An initial fixture dropped that required file capability and could not execute Caddy; it was corrected to match Compose. No HTTPS server or certificate issuance was started.
- The Windows backend compiled with pkg 6.24.0; its actual embedded runtime reports Node 26.12.1 / OpenSSL 3.5.9. Startup, synthetic local storage and 100 health requests passed. The installer compiled and its inspection payload contains exactly the 28 allowlisted files, with no extra configuration or database files. The repository intentionally tracks dist/windows-installer/SummarizeThisSetup.exe; this draft includes its rebuild. The executable is unsigned. Draft publication is not a release, real installation or operator acceptance.

Artifact SHA-256 values:

- SummarizeThisSetup.exe: 597d6beb9d82ae500ed82e65cff3f22362bd91243d0d4f3a6aa3660f9759ee36 (38,077,952 bytes).
- SummarizeThisBackend.exe: f24cd159ae5f6b622a6a9e14e901595970d54e563549cd2f1d0f650427f39523 (101,597,540 bytes; bundled inside the installer, not added as a separate Git artifact).

## Scope and remaining acceptance

Only .github/workflows files are installed GitHub Actions workflows. The four root-level YAML samples are historical references to the earlier enhanced-package layout; their old examples are retained as historical material, not asserted as current executable configuration.

No live Trello, AI, payment, HAI, cloud-provider or Hetzner deployment was exercised. No real operator data, database migration, DNS, TLS, credentials, installation or uninstall was changed. Windows and Node 24 hosted acceptance remain dependent on CI results on the published head. The local frontend suite is not a real Trello account/browser acceptance test.

## Primary sources

- https://registry.npmjs.org/pg/latest
- https://registry.npmjs.org/%40yao-pkg%2Fpkg/latest
- https://github.com/yao-pkg/pkg/releases
- https://github.com/caddyserver/caddy/releases/tag/v2.11.7
- https://hub.docker.com/_/postgres
- https://nodejs.org/en/blog/release/v26.12.1
- https://nodejs.org/en/blog/release/v24.22.1
- https://go.dev/dl/?mode=json
- https://raw.githubusercontent.com/aquasecurity/trivy/v0.76.1/pkg/fanal/types/artifact.go
