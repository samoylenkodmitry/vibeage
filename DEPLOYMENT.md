# VPS Deployment

This project is deployed only on the VPS. Vercel is no longer part of the production path.

The live shape is:

- Nginx serves the static frontend from `/opt/vibeage-frontend/out`.
- Nginx proxies `/colyseus/` and `/api/` to the game server on `127.0.0.1:3001`.
- Docker Compose runs the authoritative game server and Postgres from `/home/s/vibeage-deploy/repo`.
- Stalwart mail has separate Nginx and Docker configuration and must not be touched by game deploys.

## Production Deploy

Deploy from this trusted workstation:

```bash
pnpm run deploy:production
```

Rollback to the previous successful production commit:

```bash
pnpm run deploy:rollback
```

The local deploy script:

- refuses dirty worktrees;
- deploys only from `main`;
- runs `pnpm run check` by default;
- deploys commits that are already on `origin/main`;
- SSHes to the VPS with `${VPS_SSH_KEY:-~/.ssh/hetz}`;
- resets the VPS checkout to the exact commit being deployed;
- rebuilds the frontend and server;
- publishes static files into `/opt/vibeage-frontend/out`;
- verifies `/healthz`, public HTTPS, and that port `3001` is localhost-only.
- verifies the public Colyseus `world` room can be joined through HTTPS.

GitHub-hosted SSH deployment is disabled. Do not add VPS private keys, deploy keys, database URLs, tokens, or `.env` contents to GitHub repository secrets.

## Main Branch

`main` is production-affecting. Use feature branches for larger changes, let GitHub CI pass, then merge to `main` before deploying.

The local deploy script no longer pushes `main` by default. If local `main` is ahead of `origin/main`, publish it through the protected GitHub flow first, then run the deploy command.

## Local Development

Prerequisites:

- Node.js 20+
- pnpm
- Docker and Docker Compose, when using the local database

Setup:

```bash
pnpm install
cp .env.example .env
pnpm run dev:all
```

Common checks:

```bash
pnpm run lint
pnpm test
pnpm run build:server
pnpm run build
pnpm run check
```

## Backups

Postgres backup and restore drill commands:

```bash
pnpm run db:backup:pull-local --status
pnpm run db:backup:pull-local --force
pnpm run db:restore:test
```

Scheduled production backups are pulled by this workstation to `/media/huge/vibeage-backups/postgres` and keep only the newest two copies. The pull streams `pg_dump` over SSH and does not leave persistent dump files on the VPS.

`pnpm run db:backup` is a manual local/container backup helper for the machine where it is run. Do not install it as a VPS cron job.

## Bootstrap Scripts

`scripts/setup-server.sh` and `scripts/setup-client.sh` are bootstrap-era scripts. Do not use them as an update path on the live VPS because they can rewrite Nginx and recreate old `/opt/vibeage` assumptions.

For the current host, update through `pnpm run deploy:production` only.

## Manual Smoke Checks

After a deploy:

```bash
curl -fsS https://vibeage.eu/ >/dev/null
ssh -i ~/.ssh/hetz s@159.69.33.249 'curl -fsS http://127.0.0.1:3001/healthz'
ssh -i ~/.ssh/hetz s@159.69.33.249 'ss -ltn | grep 3001'
```

The `3001` listener must be `127.0.0.1:3001`, not `0.0.0.0:3001` or `[::]:3001`.
