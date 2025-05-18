# Game Server with Postgres Persistence

This project includes a complete game server with state persistence in PostgreSQL, packaged as a Docker Compose stack for easy deployment.

## Features

- Real-time game server using WebSockets
- PostgreSQL persistence for player data
- Complete Docker Compose deployment
- Automated database backups
- Easy scaling and deployment to a VPS

## Local Development

### Prerequisites

- Node.js 20+
- pnpm
- Docker and Docker Compose

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   pnpm run dev:all
   ```

## Docker Deployment

The easiest way to deploy the game server is using Docker Compose:

```bash
# Start the services
./deploy.sh up

# View logs
./deploy.sh logs

# Stop services
./deploy.sh down
```

## VPS Deployment Checklist

1. **Provision a VPS** (Recommended: Hetzner CX21, DigitalOcean Basic, or similar)
2. Install Docker and Docker Compose:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo apt-get install -y docker-compose-plugin
   ```
3. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/game-repo.git
   cd game-repo
   ```
4. Set up environment:
   ```bash
   cp .env.example .env
   ```
5. Start the services:
   ```bash
   docker compose up -d
   ```

## Architecture

- **Game Server**: Node.js/TypeScript authoritative server
- **Database**: PostgreSQL for data persistence
- **Web Client**: Next.js (deployed separately on Vercel)

## Enabling Backups

Uncomment the backup service in `docker-compose.yml` to enable regular database backups:

```yaml
backup:
  image: postgres:16
  depends_on: [db]
  volumes:
    - ./scripts/cron-dump.sh:/cron-dump.sh:ro
    - backups:/backups
  environment:
    DATABASE_URL: postgres://postgres:postgres@db:5432/postgres
  entrypoint: ["/bin/sh", "-c"]
  command: |
    "apt-get update && apt-get -y install cron && 
     echo '0 */4 * * * /cron-dump.sh >> /proc/1/fd/1 2>&1' > /etc/cron.d/db-backup && 
     chmod 0644 /etc/cron.d/db-backup && 
     crontab /etc/cron.d/db-backup && 
     cron -f"
  restart: unless-stopped
```

Also uncomment the `backups:` volume at the end.

## Production Notes

- Set `NEXT_PUBLIC_GAME_SERVER_URL` environment variable on Vercel to point to your game server
- For production, consider adding a reverse proxy like Caddy or Nginx for HTTPS

## VPS Deployment for vibeage.eu

We've created specialized scripts to deploy and manage the game server on our VPS (159.69.33.249).

### Initial Deployment

Run the deployment script to set up everything on the VPS:

```bash
./deploy-to-vps.sh
```

This script will:
- Install Docker and Docker Compose on the VPS
- Clone the repository
- Configure environment variables
- Set up Nginx with SSL
- Start the Docker Compose stack
- Configure automatic daily backups

### Managing Your Deployment

After the initial setup, use the management script to handle common operations:

```bash
# Deploy latest code and restart
./vps-manage.sh deploy

# View logs
./vps-manage.sh logs

# Check status
./vps-manage.sh status

# Create backup
./vps-manage.sh backup

# Restart/stop/start server
./vps-manage.sh restart
./vps-manage.sh stop
./vps-manage.sh start
```

### Client Configuration

Once deployed, update the Vercel environment variables to point to the VPS:

```
NEXT_PUBLIC_GAME_SERVER_URL=https://vibeage.eu
```

### Local Development with Database

For local development with the database:

```bash
# Run complete dev environment with database
pnpm run dev:db
```
