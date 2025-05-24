#!/bin/bash
set -e

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to display steps
step() {
  echo -e "${GREEN}==>${NC} $1"
}

# Function to display warnings
warn() {
  echo -e "${YELLOW}WARNING:${NC} $1"
}

# Function to display errors
error() {
  echo -e "${RED}ERROR:${NC} $1"
  exit 1
}

# Check if running as root or with sudo
if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root or with sudo"
fi

step "Setting up Vibeage Game Server on $(hostname)"

# Install Docker if not already installed
step "Checking for Docker..."
if ! command -v docker &> /dev/null; then
  step "Installing Docker..."
  apt-get update
  apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io
  systemctl enable docker && systemctl start docker
else
  step "Docker is already installed"
fi

# Install Docker Compose if not already installed
step "Checking for Docker Compose..."
if ! command -v docker compose &> /dev/null; then
  step "Installing Docker Compose..."
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
else
  step "Docker Compose is already installed"
fi

# Domain prompt
read -p "Enter your domain name (default: vibeage.eu): " DOMAIN
DOMAIN=${DOMAIN:-vibeage.eu}

# Setup directories for app and backups
step "Setting up application directories..."
APP_DIR="/opt/vibeage"
BACKUP_DIR="/opt/vibeage-backups"

mkdir -p $APP_DIR
mkdir -p $BACKUP_DIR

# Copy current directory contents to APP_DIR if run from the repo
if [ -f "$(pwd)/package.json" ]; then
  step "Copying project files to $APP_DIR..."
  cp -r . $APP_DIR/
else
  step "Cloning repository to $APP_DIR..."
  # If not run from within the repo, clone it
  if [ -d "$APP_DIR/.git" ]; then
    cd $APP_DIR
    git pull
  else
    git clone https://github.com/samoylenkodmitry/vibeage.git $APP_DIR
    cd $APP_DIR
    git checkout server
  fi
fi

cd $APP_DIR

# Create environment file
step "Creating environment file..."
cat > $APP_DIR/.env << EOL
DATABASE_URL=postgres://postgres:postgres@db:5432/postgres
DOMAIN=$DOMAIN
EOL

# Create backup script
step "Setting up database backup script..."
cat > $APP_DIR/backup.sh << EOL
#!/bin/bash
TIMESTAMP=\$(date +"%Y%m%d-%H%M%S")
cd $APP_DIR
docker compose exec db pg_dump -U postgres -Fc postgres > $BACKUP_DIR/vibeage-\$TIMESTAMP.dump
find $BACKUP_DIR -type f -name "vibeage-*.dump" -mtime +7 -delete
EOL
chmod +x $APP_DIR/backup.sh

# Setup backup cron job
step "Setting up daily backup..."
if ! crontab -l | grep -q "$APP_DIR/backup.sh"; then
  (crontab -l 2>/dev/null; echo "0 3 * * * $APP_DIR/backup.sh") | crontab -
fi

# Start Docker Compose
step "Starting Docker Compose..."
cd $APP_DIR
docker compose up -d --build

# Install and configure Nginx
step "Setting up Nginx..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# Configure Nginx for both server and future frontend
cat > /etc/nginx/sites-available/$DOMAIN << EOL
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    # Certbot will fill/renew these paths automatically
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # BACKEND – proxy to the Node game server
    location /socket.io/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
    }
    location /api/ {
        proxy_pass http://localhost:3001;
    }

    # FRONTEND – *will* be swapped in by setup-client.sh
    location / {
        proxy_pass http://localhost:3001;
    }

    access_log /var/log/nginx/vibeage.access.log;
    error_log  /var/log/nginx/vibeage.error.log warn;
}
EOL

# Enable site
if [ ! -f /etc/nginx/sites-enabled/$DOMAIN ]; then
  ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
fi

# Setup SSL with Let's Encrypt
step "Setting up SSL with Let's Encrypt..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || warn "SSL setup failed. You can run 'certbot --nginx -d $DOMAIN' manually later."

# Create a simple management script
step "Creating management script..."
cat > $APP_DIR/manage.sh << EOL
#!/bin/bash
case "\$1" in
  update)
    echo "Updating server..."
    cd $APP_DIR
    git pull
    docker compose down
    echo "Starting services with automatic migrations..."
    docker compose up -d --build
    ;;
  logs)
    echo "Showing logs (Ctrl+C to exit)..."
    cd $APP_DIR
    docker compose logs -f
    ;;
  backup)
    echo "Creating backup..."
    $APP_DIR/backup.sh
    ;;
  status)
    echo "Server status:"
    cd $APP_DIR
    docker compose ps
    ;;
  *)
    echo "Usage: \$0 {update|logs|backup|status}"
    exit 1
esac
EOL
chmod +x $APP_DIR/manage.sh

# Final status check
step "Checking status..."
cd $APP_DIR
docker compose ps

step "🎮 Vibeage Game Server deployed successfully! 🎮"
echo
echo "Your game server is running at: https://$DOMAIN"
echo
echo "Management commands:"
echo "  $APP_DIR/manage.sh update  - Update server"
echo "  $APP_DIR/manage.sh logs    - View logs"
echo "  $APP_DIR/manage.sh backup  - Create backup"
echo "  $APP_DIR/manage.sh status  - Check status"
echo
echo "Remember to update your Vercel environment variable:"
echo "  NEXT_PUBLIC_GAME_SERVER_URL=https://$DOMAIN"
echo 
echo "To test the server connectivity: curl -I https://$DOMAIN"
