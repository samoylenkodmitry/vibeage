# Postgres Backups

Production backups are local to the VPS and run from the active checkout at `/home/s/vibeage-deploy/repo`. They do not use GitHub secrets and do not expose Postgres publicly.

## Schedule

The VPS user crontab runs:

```bash
17 3 * * * cd /home/s/vibeage-deploy/repo && BACKUP_ROOT=/home/s/.vibeage-backups/postgres RETENTION_DAYS=14 scripts/backup-postgres.sh >> /home/s/.vibeage-backups/postgres/backup.log 2>&1
```

This creates one compressed custom-format dump per day and prunes dumps older than 14 days.

## Manual Backup

On the VPS or from the active checkout:

```bash
pnpm run db:backup
```

Backup files are written to:

```text
/home/s/.vibeage-backups/postgres/
```

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
- Copy backups off the VPS separately if stronger disaster recovery is needed.
