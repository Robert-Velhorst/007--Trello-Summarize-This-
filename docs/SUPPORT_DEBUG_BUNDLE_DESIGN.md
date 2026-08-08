# Support Debug Bundle Design

Date: 2026-08-08

## Goal

Provide a future safe export for troubleshooting without leaking provider secrets or more card content than necessary.

## Implemented Bundle Contents

- app version
- Node, platform, architecture, CPU count, and memory size
- schema version and applied migrations
- readiness flags without secret values
- collection counts and open-alert count
- the latest 50 event types with only allowlisted operational identifiers/status fields

## Explicit Exclusions

- raw API keys
- bearer tokens
- full private Trello member storage
- email addresses and user names
- source text, summaries, card descriptions, and attachment contents
- password hashes and salts

## Current Status

Implemented in `backend-support.js`, exposed at `GET /api/admin/support-bundle`, and available offline through `node backend-cli.js support-bundle`. `operations.test.js` verifies that user email and submitted source text are absent.
