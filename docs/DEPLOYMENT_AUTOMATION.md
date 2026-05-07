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
- it fails if the game server is publicly bound on port `3001`.

## Current Deployment Position

- Keep GitHub CI as the quality gate.
- Use `scripts/deploy-from-local.sh` from this workstation for no-hassle deployments.
- Keep `scripts/deploy-production.sh` as the VPS-side deploy primitive.
- Do not allow GitHub-hosted runners to SSH into the VPS unless the owner explicitly approves that risk.

## Local Deploy Script

`scripts/deploy-from-local.sh`:

- refuses to deploy with a dirty worktree;
- deploys only from `main`;
- runs `pnpm run check` by default;
- pushes `main` if local `main` is ahead of `origin/main`;
- SSHes to the VPS with `${VPS_SSH_KEY:-~/.ssh/hetz}`;
- makes the VPS checkout reset to the exact deployed commit;
- runs `scripts/deploy-production.sh` on the VPS;
- verifies local VPS `/healthz`, the `3001` port binding, and public HTTPS.

Useful overrides:

```bash
RUN_LOCAL_CHECKS=0 pnpm run deploy:production
VPS_HOST=159.69.33.249 VPS_USER=s VPS_SSH_KEY=~/.ssh/hetz pnpm run deploy:production
```

## One-Time VPS Prep

Do this with sudo/root access before enabling any future automation. Preserve the existing mail vhost first.

```bash
sudo cp /etc/nginx/sites-available/vibeage.eu /root/vibeage.eu.before-vibeage-deploy
sudo cp /etc/nginx/sites-available/mail.dmitrysamoylenko.in /root/mail.dmitrysamoylenko.in.before-vibeage-deploy

sudo install -d -o s -g s /home/s/vibeage-deploy
sudo chown -R s:s /opt/vibeage-frontend/out
sudo nginx -t
```

The current Nginx `vibeage.eu` vhost already serves `/opt/vibeage-frontend/out` and proxies `/socket.io/` plus `/api/` to `localhost:3001`, so deploys do not need to modify Nginx.

## Current Exposure To Close

The production server was observed listening publicly on `0.0.0.0:3001` for the game container. The committed Compose config now binds the game server to `127.0.0.1:3001`, so only Nginx should be public.

The VPS also has public listeners on `2106` and `7777`, likely leftovers from the Lineage experiment. Remove them only after identifying the owning root process with sudo.

## Manual Smoke Check

After a deploy:

```bash
curl -fsS https://vibeage.eu/ >/dev/null
ssh s@159.69.33.249 'curl -fsS http://127.0.0.1:3001/healthz'
ssh s@159.69.33.249 'ss -ltn | grep 3001'
```

The `3001` listener must be `127.0.0.1:3001`, not `0.0.0.0:3001` or `[::]:3001`.
