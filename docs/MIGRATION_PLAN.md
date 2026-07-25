# Migration from Prototype to Production

Date: 2026-07-23 (Phase 103)

## Migration Checklist

1. **Host Static Power-Up Files:** Deploy static assets (`connector.html`, `popup.html`, `settings-powerup.html`, `summarizer-core.js`, etc.) to CDN/HTTPS static web server.
2. **Register Trello Power-Up:** Register capabilities and connector URL on Trello Power-Up Admin Portal.
3. **Backend Infrastructure (Optional):** Provision persistent PostgreSQL database, preserve or upgrade the existing salted password hashing model, replace env-only admin credential handling, configure TLS reverse proxy, and deploy `backend-server.js`.
4. **Proxy Deployment (Optional):** Deploy Cloudflare Worker (`proxy/cloudflare-worker.mjs`) using `wrangler deploy` and configure provider secrets.
