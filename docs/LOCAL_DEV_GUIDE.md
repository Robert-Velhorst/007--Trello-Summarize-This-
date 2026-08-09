# Local Development Guide — One-Command Experience

Date: 2026-07-23 (Phase 031)

## Prerequisites

- Node.js >= 18 (verified with v20.20.2)
- No other dependencies required for the static Power-Up
- Optional: Cloudflare Wrangler for proxy development

## One-Command Start

```bash
npm run dev
# or equivalently:
npm start
# → Starts at http://127.0.0.1:17117/
# → Open http://127.0.0.1:17117/connector.html
```

This single command starts the local static file server with:
- CORS headers for Trello iframe compatibility
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Path traversal protection
- Graceful shutdown on Ctrl+C

## Full Local Stack (Power-Up + Backend)

Open two terminals:

**Terminal 1 — Static Power-Up:**
```bash
npm run dev
```

**Terminal 2 — Backend API:**
```bash
export JWT_SECRET="dev-secret-min-32-chars-xxxxxxxxxx"
export ADMIN_PASSWORD="dev-admin-password"
export TRELLO_APP_KEY="your-trello-app-key"   # optional
npm run start:backend
```

Backend starts at http://127.0.0.1:8787/

## Diagnostics

```bash
npm run doctor           # Verify required files, modules, operations, and config
npm run doctor:backend   # Verify backend env vars
npm run flags            # List all feature flags and their effective values
```

## Test

```bash
npm test              # Core + backend contract tests
npm run test:all      # Core + backend + adversarial tests
```

## Environment Variables (Optional)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 17117 | Local dev server port |
| `HOST` | 127.0.0.1 | Local dev server host |
| `API_PORT` | 8787 | Backend server port |
| `API_HOST` | 127.0.0.1 | Backend server host |

## Common Issues

| Problem | Fix |
|---|---|
| Port 17117 already in use | `PORT=17118 npm run dev` |
| Backend fails to start | Run `npm run doctor:backend` — check missing env vars |
| Module not found | Run `npm run doctor` — check which module fails to load |
| Tests fail | Run `node test.js` for detailed assertion output |
