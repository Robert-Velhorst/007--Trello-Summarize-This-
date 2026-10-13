# Hetzner Cloud Deployment

This guide runs the authenticated Summarize This backend on one Hetzner Linux server. The Trello Power-Up remains a static site on GitHub Pages; Hetzner replaces the temporary tunnel used to reach a backend on a Windows PC. Trello's connector URL does not change as part of this backend move.

The deployment uses Docker Compose, PostgreSQL, and Caddy. PostgreSQL is private to the Docker network, the Node backend is published only on the server's loopback interface, and Caddy is the only public application entry point. Caddy obtains and renews HTTPS certificates for the configured public DNS name. Public HTTPS requires DNS to point to the server and inbound TCP ports 80 and 443 to reach it. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [Hetzner A records](https://docs.hetzner.com/networking/dns/record-types/a-record/).

## Before You Start

You need:

- An existing Hetzner Linux server with Docker Engine and the Docker Compose v2 plugin installed. This repository does not create a paid server or change Hetzner billing.
- TCP ports 80 and 443 must be free for this Caddy container. If another site already uses them, do not start a second public proxy; integrate this backend with the server's existing reverse proxy instead.
- A domain you control, with an `A` record for the chosen API subdomain pointing to the server's public IPv4 address. Add an `AAAA` record only when the server's IPv6 connectivity and firewall are configured too.
- SSH access to the server. Keep SSH restricted to your administration network where possible.
- In the Hetzner Cloud Firewall, allow inbound TCP 80 and 443 for public web access. Do not replace an existing firewall policy without reviewing the other services on that server.
- The Git repository cloned on the server.

Example API name: `api.example.com`. Replace it below with your own domain. DNS hosting can remain with your registrar or be managed in Hetzner; Hetzner documents that A records point hostnames to IPv4 addresses.

## Configure Secrets

In the repository directory on the server, create a private `.env` file from `.env.example`. Set the following values:

| Setting | Value |
|---|---|
| `APP_DOMAIN` | The API hostname, such as `api.example.com`. |
| `JWT_SECRET` | A unique random secret of at least 32 characters. |
| `ADMIN_EMAIL` | The email address for the separate backend administrator login. |
| `ADMIN_PASSWORD` | A unique administrator password of at least 12 characters. It is not the owner account password used in the Trello Power-Up. |
| `POSTGRES_PASSWORD` | A unique, URL-safe random password. |
| `REGISTRATION_MODE` | `closed` after owner setup. Temporarily use `single-user` for the first owner account. |
| `BACKEND_ALLOWED_ORIGINS` | Keep the exact GitHub Pages origin shown in `.env.example`; do not add wildcards. |

Generate random secrets with a password manager. If using Node locally, `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` prints a URL-safe random value. Do not commit `.env`, paste secrets into Trello, or send them in chat.

## Start the Services

Check that the DNS record is resolving to the intended server, then start the Hetzner stack:

```sh
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml ps
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml logs --tail=100 backend proxy
```

The first Caddy start can take a short time while it obtains a certificate. Check readiness at `https://<APP_DOMAIN>/api/readiness`; it should return `"status":"ready"`. The backend health endpoint is `https://<APP_DOMAIN>/api/health`.

The second Compose file is opt-in. A normal local `docker compose up` neither requires `APP_DOMAIN` nor publishes ports 80/443. On the Hetzner host, port 8787 is bound only to `127.0.0.1`; PostgreSQL has no host port mapping.

## Create the First Owner Safely

For a fresh installation, the normal registration mode is closed. If importing existing accounts, skip this section and follow the data migration section below. To create exactly one owner without opening public registration, use the backend's `single-user` mode through an SSH port forward:

1. In the server's `.env`, set `REGISTRATION_MODE=single-user`, then recreate the backend with `docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --force-recreate backend`.
2. On your Windows PC, open PowerShell and start an SSH tunnel. Replace the user and address with your server login:

   ```powershell
   ssh -N -L 8787:127.0.0.1:8787 <ssh-user>@<server-ip>
   ```

   Keep this PowerShell window open. The connection to the server is encrypted by SSH; port 8787 is not exposed publicly.
3. In a second PowerShell window, run the repository's `deployment/hetzner/bootstrap-owner.ps1`. It asks for the owner's email, display name, and a password without displaying the password or session token.
4. Stop the SSH tunnel with `Ctrl+C` in its window.
5. Set `REGISTRATION_MODE=closed` in the server's `.env` and recreate the backend again:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --force-recreate backend
   ```

The backend rejects first-owner registration requests that arrive with proxy-forwarding headers in `single-user` mode. The local SSH-forwarded request avoids those headers, and `createFirstUser` prevents a second account from claiming the owner slot. Keep registration closed after setup.

## Connect Trello

The connector iframe stays at the current GitHub Pages URL. In the Trello Power-Up settings, set the backend API URL to `https://<APP_DOMAIN>` and sign in with the owner account you just created. Do not replace the Trello connector URL with the API URL: they serve different purposes.

No ngrok client or always-open Windows tunnel is needed for this hosted backend. The Windows installer can still run its standalone local backend; keep the existing Windows data until any required migration is separately backed up and verified.

## Updates and Backups

Pull and rebuild from the intended branch on the server:

```sh
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml ps
```

Create a PostgreSQL backup before upgrades or data changes. Store it outside the server as well; a backup on the same machine does not protect against server or disk loss:

```sh
backup_dir="$HOME/summarize-this-backups"
umask 077
set -o pipefail
mkdir -p "$backup_dir"
docker compose exec -T database pg_dump -U summarize_this -d summarize_this | gzip > "$backup_dir/summarize-this-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

Use `docker compose -f docker-compose.yml -f docker-compose.hetzner.yml down` to stop the complete hosted stack while preserving named volumes. Never add `-v` on a live installation; it deletes the PostgreSQL and Caddy state volumes.

## Migrate Existing Windows Data

The CLI can import a local JSON store or application JSON backup into an empty destination. It preserves account password hashes, summaries, settings, workspace memberships, reminders, reviewed jobs, sessions, and HAI capability records. It refuses to overwrite existing records or configured settings. The source is limited to 64 MiB and is never modified by the importer.

1. Stop the Windows backend before copying its private `data/local-backend-store.json` file. Keep the original installation and backup directory. Transfer the copy over SSH only to the intended server and keep it private (mode `0600`). Do not use a public download URL or commit the snapshot to Git.
2. If existing sessions/HAI capabilities must continue to work, use the original backend's `JWT_SECRET` in the server's private `.env`. A new secret leaves account passwords intact but requires signing in again and issuing new HAI URLs. Historical backup records also require the original backup files to be copied into the destination runtime volume's `backups` directory before those snapshots can be restored.
3. Keep the database running, but stop both the backend writer and its public proxy. The PostgreSQL store excludes concurrent writers, so the import CLI cannot run while the backend owns the database lock:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.hetzner.yml stop proxy backend
   ```

4. Inspect the staged snapshot. This one-time container runs as root only to read the private file; it does not publish service ports. The output contains a SHA-256 checksum and collection counts, without account credentials or record content:

   ```sh
   docker compose run --rm --no-deps --user 0 -v "$HOME/summarize-this-snapshot.json:/import/state.json:ro" backend node backend-cli.js inspect-import /import/state.json
   ```

5. Compare that checksum with the private source copy's checksum on Windows (`Get-FileHash -Algorithm SHA256`). Import only after they match, replacing `<sha256>` below with that exact value:

   ```sh
   docker compose run --rm --no-deps --user 0 -v "$HOME/summarize-this-snapshot.json:/import/state.json:ro" backend node backend-cli.js import-state /import/state.json --sha256=<sha256> --confirm
   docker compose run --rm --no-deps backend node backend-cli.js status
   ```

6. Compare the destination counts with the inspection report, keep `REGISTRATION_MODE=closed`, then start the services again. Check owner login, retained summaries, and any HAI feed before switching the Power-Up's backend URL:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d
   ```

The stored records are migrated by this command; external Windows files and browser/Trello member-private settings are not uploaded. Keep the old installation until those checks succeed.

This is a single-server deployment, not a multi-instance cluster. It does not yet provide offsite backup automation, monitoring/alerting, managed secret storage, or a tested disaster-recovery procedure.
