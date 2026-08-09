# Secrets Management and Credential Rotation

Date: 2026-07-23 (Phase 030)

## Secrets in the Power-Up

| Secret | Where stored | How rotated |
|---|---|---|
| Trello app key | `trello-config.js` (public, read-only) | Update file and redeploy static hosting |
| AI provider API keys | Trello member-private storage (per user) | User deletes old key and enters new key in settings |
| Proxy endpoint | Trello member-private storage (per user) | User updates endpoint in settings |

## Backend Secrets

| Secret | Where stored | How rotated |
|---|---|---|
| `JWT_SECRET` | Environment variable | Stop server, set new env var, restart — all existing tokens are invalidated |
| `ADMIN_PASSWORD` | Environment variable | Stop server, set new env var, restart |
| `STRIPE_SECRET_KEY` | Environment variable | Rotate in Stripe dashboard, update env var, restart |
| `TRELLO_APP_KEY` | Environment variable | Update in Trello dev console, update env var, restart |
| AI provider keys (backend) | Environment variables | Rotate in provider dashboard, update env var, restart |

## Proxy Secrets

| Secret | Where stored | How rotated |
|---|---|---|
| Provider keys (proxy) | `proxy/.dev.vars` (local) or Cloudflare secrets | `wrangler secret put KEY_NAME` |

`proxy/.dev.vars` is excluded by `.gitignore` and must never be committed.

## Rotation Checklist

On any suspected credential compromise:
1. Immediately revoke the compromised key at the provider (OpenAI, Anthropic, Google, Stripe, Cloudflare).
2. Generate a new key from the provider dashboard.
3. Update the environment variable or `wrangler secret`.
4. If `JWT_SECRET` is compromised: restart backend — all user sessions are invalidated.
5. Notify users to re-enter their AI provider keys if the Trello app key changes.
6. Record the rotation event in the operator runbook.

## Credential Hardening Gaps

| Gap | Required Action |
|---|---|
| Backend user passwords are hashed, but admin secrets still live in environment configuration | Harden admin auth secret handling, rotation, and deployment boundaries |
| No secret scanning in CI | Add `gitleaks` or `trufflesecurity` scan to CI |
| No credential rotation schedule | Establish quarterly rotation policy |
