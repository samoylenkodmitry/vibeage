# Postgres Backups

Production backups are pulled from this workstation into `/media/huge/vibeage-backups/postgres`. The script streams `pg_dump` over SSH and does not leave persistent dump files on the VPS. It does not use GitHub secrets and does not expose Postgres publicly.

## Schedule

The workstation systemd user timer runs `~/.local/bin/vibeage-pull-postgres-backup`, which wraps the tracked script:

```bash
pnpm run db:backup:pull-local
```

The timer waits about one hour after workstation startup, retries hourly, skips if a successful backup already happened today, sends a dunst notification on success or failure, and keeps only the newest two local dumps.

Check local backup status:

```bash
pnpm run db:backup:pull-local --status
```

Force a fresh local pull:

```bash
pnpm run db:backup:pull-local --force
```

## Manual Backup

From a checkout with access to the Docker Compose database:

```bash
pnpm run db:backup
```

By default this manual command writes to:

```text
~/.vibeage-backups/postgres/
```

Do not install this as a VPS cron job; scheduled production backups should be pulled to the workstation instead.

## Restore Drill

On this workstation, `pnpm run db:restore:test` defaults to the off-VPS local backup directory when it exists:

```text
/media/huge/vibeage-backups/postgres/
```

Test the latest local backup without touching production:

```bash
pnpm run db:restore:test
```

Test a specific backup:

```bash
BACKUP_FILE=/media/huge/vibeage-backups/postgres/vibeage_<timestamp>.dump pnpm run db:restore:test
```

The restore test starts a temporary `docker.io/library/postgres:16` container, streams the dump into it with `pg_restore`, verifies public tables exist, and removes the temporary container on exit.

The restore drill uses Docker when a Docker daemon is available and falls back to Podman when it is not. To force a runtime:

```bash
CONTAINER_RUNTIME=podman pnpm run db:restore:test
```

## Emergency Notes

- Do not restore into the production `vibeage-db-1` container until the target backup has passed `pnpm run db:restore:test`.
- Keep Postgres bound to `127.0.0.1:5432`; backups and restore drills use local container access.
- Keep persistent backup dumps off the VPS; `/home/s/.vibeage-backups/postgres` is intentionally not used for scheduled production retention.
