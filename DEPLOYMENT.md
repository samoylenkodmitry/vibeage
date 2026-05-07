# VPS Deployment

This project is deployed on a VPS. The VPS runs the authoritative game server, PostgreSQL, and an Nginx-served static frontend build.

Production updates should use the local deploy path in `docs/DEPLOYMENT_AUTOMATION.md`: run `pnpm run deploy:production` from this workstation. GitHub-hosted SSH deployment is disabled; do not put VPS SSH keys into GitHub repository secrets. The old `scripts/setup-server.sh` and `scripts/setup-client.sh` scripts are bootstrap-era scripts and must not be used as routine updates on the live VPS because they can rewrite Nginx.

## Features

- Real-time game server using WebSockets
- PostgreSQL persistence for player data
- Docker Compose server/database deployment
- Nginx static frontend hosting
- Automated database backups
- VPS-only production path

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

For local or VPS server management, Docker Compose is wrapped by `deploy.sh`:

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
   git clone https://github.com/samoylenkodmitry/vibeage.git
   cd vibeage
   git checkout main
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
   git checkout main
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

6. Run the frontend setup script if the frontend is not already served from the VPS:
   ```bash
   sudo ./scripts/setup-client.sh
   ```

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
- **Web Client**: Next.js static export served by Nginx from the VPS

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

## VPS Deployment for vibeage.eu

Use `scripts/setup-server.sh` to install Docker, configure `/opt/vibeage`, start Docker Compose, configure Nginx, enable SSL, and create backup/update management scripts. Use `scripts/setup-client.sh` to build and serve the frontend from the same VPS.

### Managing Your Deployment

After setup, use the management script on the VPS:

```bash
# Update server only
/opt/vibeage/manage.sh update-server

# Update frontend only
/opt/vibeage/manage.sh update-frontend

# Update both server and frontend
/opt/vibeage/manage.sh update-all

# View logs
/opt/vibeage/manage.sh logs

# Create backup
/opt/vibeage/manage.sh backup

# Check status
/opt/vibeage/manage.sh status
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
