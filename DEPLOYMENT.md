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

## Quick VPS Deployment

To deploy the game server on a VPS:

1. SSH into your VPS and create a user named 's':
   ```bash
   # As root on your VPS
   useradd -m -s /bin/bash s
   usermod -aG sudo s     # Add to sudo group
   
   # Setup SSH key authentication for the user
   mkdir -p /home/s/.ssh
   chmod 700 /home/s/.ssh
   cp /root/.ssh/authorized_keys /home/s/.ssh/
   chmod 600 /home/s/.ssh/authorized_keys
   chown -R s:s /home/s/.ssh
   
   # Harden SSH
   sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
   sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
   systemctl restart ssh
   ```

2. Switch to the new user:
   ```bash
   su - s
   ```

3. Clone the repository:
   ```bash
   git clone https://github.com/samoylenkodmitry/vibeage.git
   cd vibeage
   git checkout server
   ```

4. Run the setup script:
   ```bash
   sudo ./scripts/setup-server.sh
   ```

5. The script will:
   - Install Docker and Docker Compose
   - Set up the application in `/opt/vibeage`
   - Configure Nginx with SSL
   - Start the server
   - Create management scripts for updates and backups

6. Update your client environment:
   - On Vercel: Set `NEXT_PUBLIC_GAME_SERVER_URL=https://yourdomain.com`

### Managing the Server

The setup script creates a management script at `/opt/vibeage/manage.sh` with the following commands:

```bash
# Update the server
/opt/vibeage/manage.sh update

# View server logs
/opt/vibeage/manage.sh logs

# Create database backup
/opt/vibeage/manage.sh backup

# Check server status
/opt/vibeage/manage.sh status
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

We've created specialized scripts to deploy and manage the game server on our VPS.

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

## Setting Up the Frontend on the Same VPS

To deploy the frontend on the same VPS as the server:

1. SSH into your VPS:
   ```bash
   ssh -i your_ssh_key your_vps_user@your_vps_ip
   ```

2. If you haven't already deployed the server, follow the server deployment steps first.

3. Navigate to the repository:
   ```bash
   cd vibeage
   ```

4. Run the client setup script:
   ```bash
   sudo ./scripts/setup-client.sh
   ```

5. The script will:
   - Install Node.js and pnpm if needed
   - Clone or reuse the repository code
   - Build the Next.js frontend
   - Configure Nginx to serve both the frontend and backend
   - Create scripts for easy updates

6. After setup, both your frontend and backend will be available at `https://vibeage.eu`

### Managing Both Server and Frontend

The management script has been extended to handle both components:

```bash
# Update server only
/opt/vibeage/manage.sh update-server

# Update frontend only
/opt/vibeage/manage.sh update-frontend

# Update both server and frontend
/opt/vibeage/manage.sh update-all

# Other commands remain the same
/opt/vibeage/manage.sh logs
/opt/vibeage/manage.sh backup
/opt/vibeage/manage.sh status
```
