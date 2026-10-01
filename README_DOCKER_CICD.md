# Docker Deployment

This repository's Docker stack runs the Node.js backend and PostgreSQL. The Trello Power-Up frontend is a separate static site deployed to GitHub Pages; this is not an Express web app and does not require Redis, MongoDB, Prometheus, Grafana, or an Nginx container.

## Local Docker

Requirements: Docker Engine and the Docker Compose v2 plugin.

```sh
cp .env.example .env
# Replace the example values in .env with private secrets.
docker compose up -d --build
docker compose ps
```

The backend is reachable on the host only at `http://127.0.0.1:8787`. PostgreSQL is reachable only on the private Compose network. Do not commit `.env`.

## Hetzner Cloud

For persistent public HTTPS hosting, use the complete [Hetzner deployment guide](docs/HETZNER_DEPLOYMENT.md). The `docker-compose.hetzner.yml` overlay adds Caddy on ports 80/443, requires a public DNS name, and keeps PostgreSQL private. It does not provision a Hetzner server, manage DNS, or perform a production deployment automatically.

```sh
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build
```

For a fresh database, create the first owner through the documented SSH tunnel. An existing Windows snapshot can instead be inspected and imported into the empty database with the migration CLI. Registration remains closed after setup. Data is not copied automatically.

## Operations

```sh
docker compose ps
docker compose logs --tail=100 backend proxy
docker compose exec -T database pg_dump -U summarize_this -d summarize_this > "$HOME/summarize-this-backup.sql"
```

Store backups off the server and verify that they can be restored. `docker compose down` preserves named volumes; `docker compose down -v` deletes them.
