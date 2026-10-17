# PostgreSQL 17 to 18.6 upgrade

The Compose stack now targets the official PostgreSQL 18.6 Alpine image, pinned to its multi-platform manifest digest. PostgreSQL 18 changes the official image's data directory and volume mount. The stack uses a new volume at `/var/lib/postgresql`; do not attach the PostgreSQL 17 volume directly to the 18.6 container.

This is an operator-controlled major-version migration. It does not run at application startup. Rehearse it from a verified backup before changing any retained database.

1. Stop application writes and take an encrypted backup outside the host. Verify the backup by restoring it into an isolated PostgreSQL 17 database. Keep the original `summarize-this-postgres` volume untouched.
2. Start a temporary PostgreSQL 17 container with the old volume mounted at `/var/lib/postgresql/data`, using the original database credentials. Bind its port to loopback only.
3. Use the PostgreSQL 18.6 `pg_dump` client to create a custom-format dump of `summarize_this`; also record the role and database configuration needed by the app. Verify the dump is non-empty and readable with `pg_restore --list`.
4. Start PostgreSQL 18.6 with the new `summarize-this-postgres-v18` volume at `/var/lib/postgresql`. Restore into the initialized `summarize_this` database using the matching app role. Do not use `docker compose down -v` or remove the original volume.
5. Verify the restored schema, representative rows, app health, worker behavior, and a fresh off-host backup. Keep the PostgreSQL 17 volume offline through the recovery window.
6. Resume writes only after verification, then update the operator's backup and restore runbook to identify the new volume.

For Hetzner, keep PostgreSQL on the private Compose network and expose only the HTTPS reverse proxy. PostgreSQL's official image documents the PostgreSQL 18 `PGDATA` and volume change [here](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata). The PostgreSQL 18 release notes require dump/restore, `pg_upgrade`, or logical replication when migrating from a previous major release: [PostgreSQL 18 release notes](https://www.postgresql.org/docs/18/release-18.html).