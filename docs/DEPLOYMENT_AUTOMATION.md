# Deployment Automation

Production deploys are VPS-only and local-initiated. Run the deploy from a trusted local machine with the existing VPS SSH key:

```bash
pnpm run deploy:production
```

GitHub-hosted SSH deployment is disabled and must not be re-enabled without explicit owner approval. Do not store VPS SSH private keys in GitHub repository secrets. The previous GitHub Actions deploy key was revoked on 2026-05-07 by deleting the repository secrets and removing the corresponding public key from the VPS `s` user's `authorized_keys`.

The deploy script is deliberately narrow:

- it does not rewrite Nginx vhosts;
- it does not touch Stalwart/mail configuration;
- it does not run the old setup scripts;
- it rebuilds the frontend and server from the requested Git commit;
- it runs Docker Compose with `COMPOSE_PROJECT_NAME=vibeage` so the existing Postgres volume is reused;
- it publishes static files into the existing Nginx root;
- it fails if the game server is publicly bound on port `3001`;
- it records the last and previous successful deploy markers under `~/.vibeage-deploy`.

## Current Deployment Position

- Keep GitHub CI as the quality gate.
- Use `scripts/deploy-from-local.sh` from this workstation for no-hassle deployments.
- Keep `scripts/deploy-production.sh` as the VPS-side deploy primitive.
- Use `pnpm run deploy:rollback` from this workstation to redeploy the previous successful commit.
- Do not allow GitHub-hosted runners to SSH into the VPS unless the owner explicitly approves that risk.
- Keep deploys tied to commits already on `origin/main`; use GitHub CI before production deploys.

## Local Deploy Script

`scripts/deploy-from-local.sh`:

- refuses to deploy with a dirty worktree;
- deploys only from `main`;
- runs `pnpm run check` by default;
- refuses to deploy local commits that are not on `origin/main` unless `ALLOW_DEPLOY_PUSH=1` is set intentionally;
- SSHes to the VPS with `${VPS_SSH_KEY:-~/.ssh/hetz}`;
- makes the VPS checkout reset to the exact deployed commit;
- runs `scripts/deploy-production.sh` on the VPS;
- verifies local VPS `/healthz`, the `3001` port binding, and public HTTPS.
- supports exact commit deploys through `DEPLOY_SHA=<sha> scripts/deploy-from-local.sh` for rollback use.

Useful overrides:

```bash
RUN_LOCAL_CHECKS=0 pnpm run deploy:production
ALLOW_DEPLOY_PUSH=1 pnpm run deploy:production
VPS_HOST=159.69.33.249 VPS_USER=s VPS_SSH_KEY=~/.ssh/hetz pnpm run deploy:production
```

`ALLOW_DEPLOY_PUSH=1` is only for controlled maintenance when branch protection permits it. The normal flow is feature branch, passing GitHub CI, merge to `main`, then deploy.

## Rollback

After at least one deploy with the current scripts, the VPS keeps both:

- `~/.vibeage-deploy/last-deploy.json`
- `~/.vibeage-deploy/previous-deploy.json`

Rollback to the previous successful deploy from this workstation:

```bash
pnpm run deploy:rollback
```

Rollback to a specific commit that is reachable from `origin/main`:

```bash
ROLLBACK_SHA=<git-sha> pnpm run deploy:rollback
```

The rollback path still uses the local SSH key, still runs the VPS-side health checks, and does not require GitHub repository secrets.

## Database Backups

Postgres backups are pulled by the workstation through `scripts/pull-postgres-backup-local.sh` and documented in `docs/POSTGRES_BACKUPS.md`. The VPS should not retain scheduled dump files.

Useful commands on this workstation:

```bash
pnpm run db:backup:pull-local --status
pnpm run db:backup:pull-local --force
pnpm run db:restore:test
```

Backups live under `/media/huge/vibeage-backups/postgres` by default and are not part of the Git checkout.

## One-Time VPS Prep

Do this with sudo/root access before enabling any future automation. Preserve the existing mail vhost first.

```bash
sudo cp /etc/nginx/sites-available/vibeage.eu /root/vibeage.eu.before-vibeage-deploy
sudo cp /etc/nginx/sites-available/mail.dmitrysamoylenko.in /root/mail.dmitrysamoylenko.in.before-vibeage-deploy

sudo install -d -o s -g s /home/s/vibeage-deploy
sudo chown -R s:s /opt/vibeage-frontend/out
sudo nginx -t
```

The current Nginx `vibeage.eu` vhost serves `/opt/vibeage-frontend/out` and proxies `/colyseus/` plus `/api/` to `localhost:3001`, so normal deploys do not need to modify Nginx.

The old `/opt/vibeage` checkout has been archived and removed. `/opt/vibeage-frontend` now intentionally contains only the static `out` directory used by Nginx.

## Current Exposure

As of 2026-05-07, the production game and database containers bind only to localhost:

- `127.0.0.1:3001` for the game server;
- `127.0.0.1:5432` for Postgres.

The old Lineage stream listeners on `2106` and `7777` were disabled, Stalwart's raw `8080` listener was restricted to `127.0.0.1`, and the old WireGuard `wg0` tunnel was stopped, disabled, and removed.

The VPS host firewall is persisted through `netfilter-persistent` with default-drop INPUT policy. The intentional public TCP allow-list is `22`, `25`, `80`, `143`, `443`, `465`, `587`, and `993`. Do not add public ports for the game server or database; keep them behind Nginx/local Docker networking.

## Manual Smoke Check

After a deploy:

```bash
pnpm run health:production
curl -fsS https://vibeage.eu/ >/dev/null
ssh s@159.69.33.249 'curl -fsS http://127.0.0.1:3001/healthz'
ssh s@159.69.33.249 'ss -ltn | grep 3001'
```

The `3001` listener must be `127.0.0.1:3001`, not `0.0.0.0:3001` or `[::]:3001`.
