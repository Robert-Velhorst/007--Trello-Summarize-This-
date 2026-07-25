# V3 Archive Port Review

Date: 2026-07-26

Source reviewed: `007 - Trello - Summarize this! V3.zip`

## Outcome

The archive is a historical bundle rather than a newer canonical source tree. It
contains 139 top-level files and 23 nested ZIP packages. Most of its 1.23 GB
footprint consists of repeated Electron executables and packaged dependencies.

Current `main` already contains maintained or hardened versions of the useful V2
and V3 Power-Up modules, including provider selection, attachment metadata and
bounded text extraction, custom prompts, batch planning, history, exports,
onboarding, cost tracking, and Trello integration.

## Ported

- Restored `index.js` as a real compatibility entry point.
- Declared `index.js` as the package `main` entry so `node .` starts the same
  lightweight local server as `npm start`.
- Added regression assertions so the placeholder cannot silently return.
- Hardened feature-flag lookup for runtimes that expose an incomplete or blocked
  `localStorage` object, found while running the adversarial verification suite.

This retains the useful launcher convention found throughout the archive without
bringing back Express, Electron, or another runtime.

## Deliberately Not Ported

- Electron desktop bundles: duplicate the browser experience, add hundreds of
  megabytes, use a broader process privilege surface, and conflict with the
  lightweight Windows installer.
- Historical Express/backend packages: depend on an abandoned multi-service
  stack and include placeholder credential behavior. The maintained backend and
  optional proxy have stricter startup and secret boundaries.
- Resource polling and file logging: add background CPU, memory, and disk use.
  Current timing and budget records are bounded and generated during real work.
- "99.9% accuracy" modules and documents: no representative benchmark supports
  that claim. Current confidence and evidence signals are review aids.
- PDF, Word, Excel, OCR, and transcription claims: archive implementations are
  scaffolding or dependency checks, not verified extraction pipelines.
- Old CI, deployment, Docker, and monitoring files: target packages and services
  that are not part of the maintained static Power-Up or lightweight installer.
- Generated screenshots, analysis exports, executable binaries, and repeated
  nested release ZIP files: build artifacts or user data, not source.

## Revisit Conditions

Binary attachment extraction should be added only through a bounded, tested
backend path with explicit user approval, file-type validation, decompression
limits, timeouts, and no metadata-only success claims.

A desktop runtime should be reconsidered only if a browser-based local launcher
cannot support a concrete user workflow. Any replacement must preserve the
current installer footprint, local-only binding, and no-background-service
behavior.
