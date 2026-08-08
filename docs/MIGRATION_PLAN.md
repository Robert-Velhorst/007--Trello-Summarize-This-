# Migration from Prototype to Production

Date: 2026-08-08

## Migration Checklist

1. **Host Static Power-Up Files:** Deploy static assets (`connector.html`, `popup.html`, `settings-powerup.html`, `summarizer-core.js`, etc.) to CDN/HTTPS static web server.
2. **Register Trello Power-Up:** Register capabilities and connector URL on Trello Power-Up Admin Portal.
3. **Single-Instance Backend (Optional):** Use `docker-compose.yml` or `npm run start:backend` with strong secrets, `RUN_WORKER=true`, a persistent volume, and owner-controlled TLS ingress. Automatic JSON schema migrations and local backup/restore support this mode.
4. **Proxy Deployment (Optional):** Deploy Cloudflare Worker (`proxy/cloudflare-worker.mjs`) using `wrangler deploy` and configure provider secrets.
5. **Scale-Out Migration (Only If Needed):** Move collections to a managed database and queue while preserving workspace ownership, idempotency, leases, retry state, audit events, reconciliation checks, and restore procedures. Do not run multiple JSON-backend instances.
