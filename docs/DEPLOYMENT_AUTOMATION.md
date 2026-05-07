# Deployment Automation

Production deploys are VPS-only. GitHub Actions runs `Deploy` after `CI` succeeds on `main`; the deploy job then SSHes to the VPS and runs `scripts/deploy-production.sh`.

The deploy script is deliberately narrow:

- it does not rewrite Nginx vhosts;
- it does not touch Stalwart/mail configuration;
- it does not run the old setup scripts;
- it rebuilds the frontend and server from the requested Git commit;
- it runs Docker Compose with `COMPOSE_PROJECT_NAME=vibeage` so the existing Postgres volume is reused;
- it publishes static files into the existing Nginx root;
- it fails if the game server is publicly bound on port `3001`.

## Required GitHub Secrets

- `VPS_HOST`: VPS hostname or IP.
- `VPS_USER`: SSH user.
- `VPS_SSH_KEY`: private key for a dedicated deploy key, not a personal all-purpose key.

Optional secrets:

- `VPS_PORT`: SSH port, defaults to `22`.
- `VPS_DOMAIN`: public game domain, defaults to `vibeage.eu`.
- `VPS_DEPLOY_ROOT`: remote checkout/cache path, defaults to `$HOME/vibeage-deploy`.
- `VPS_FRONTEND_PUBLIC_DIR`: static frontend root, defaults to `/opt/vibeage-frontend/out`.

If the required secrets are missing, the deploy workflow exits successfully without deploying.

## One-Time VPS Prep

Do this with sudo/root access before enabling the deploy secrets. Preserve the existing mail vhost first.

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

After the first automated deploy:

```bash
curl -fsS https://vibeage.eu/ >/dev/null
ssh s@159.69.33.249 'curl -fsS http://127.0.0.1:3001/healthz'
ssh s@159.69.33.249 'ss -ltn | grep 3001'
```

The `3001` listener must be `127.0.0.1:3001`, not `0.0.0.0:3001` or `[::]:3001`.
