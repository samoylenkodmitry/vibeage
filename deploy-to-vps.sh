#!/bin/bash
set -e

# Configuration variables
VPS_IP="159.69.33.249"
VPS_USER="root"  # Adjust if you're using a different user
DOMAIN="vibeage.eu"
REPO_URL="https://github.com/yourusername/your-repo.git"  # Replace with your actual repository URL
APP_DIR="/opt/vibeage"
BACKUP_DIR="/opt/vibeage-backups"

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

# Check if we can connect to the VPS
step "Checking connection to VPS at $VPS_IP..."
ssh -o BatchMode=yes -o ConnectTimeout=5 ${VPS_USER}@${VPS_IP} echo "Connection successful" > /dev/null 2>&1 || error "Cannot connect to the VPS. Check your SSH configuration."

# Ensure Docker and Docker Compose are installed on VPS
step "Ensuring Docker and Docker Compose are installed on VPS..."
ssh ${VPS_USER}@${VPS_IP} << 'EOF'
# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io
    systemctl enable docker && systemctl start docker
fi

# Install Docker Compose if not already installed
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
fi
EOF

# Deploy the application
step "Deploying the application to $APP_DIR..."
ssh ${VPS_USER}@${VPS_IP} << EOF
# Create application directory if it doesn't exist
mkdir -p $APP_DIR
mkdir -p $BACKUP_DIR

# Clone or update the repository
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd $APP_DIR
    git pull
else
    echo "Cloning new repository..."
    git clone $REPO_URL $APP_DIR
fi

# Create .env file with database connection string
cat > $APP_DIR/.env << 'EOL'
DATABASE_URL=postgres://postgres:postgres@db:5432/postgres
DOMAIN=$DOMAIN
EOL

# Set up a simple backup script that runs daily
cat > $APP_DIR/backup.sh << 'EOL'
#!/bin/bash
TIMESTAMP=\$(date +"%Y%m%d-%H%M%S")
cd $APP_DIR
docker compose exec db pg_dump -U postgres -Fc postgres > $BACKUP_DIR/vibeage-\$TIMESTAMP.dump
find $BACKUP_DIR -type f -name "vibeage-*.dump" -mtime +7 -delete
EOL
chmod +x $APP_DIR/backup.sh

# Set up daily cron job for backup if not already set up
if ! crontab -l | grep -q "$APP_DIR/backup.sh"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * $APP_DIR/backup.sh") | crontab -
fi

# Start or restart the application with Docker Compose
cd $APP_DIR
docker compose down || true
docker compose up -d --build

# Set up Nginx as a reverse proxy if it's not already set up
if ! command -v nginx &> /dev/null; then
    apt-get update && apt-get install -y nginx certbot python3-certbot-nginx
fi

# Configure Nginx
cat > /etc/nginx/sites-available/$DOMAIN << 'EOL'
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOL

# Enable the site if not already enabled
if [ ! -f /etc/nginx/sites-enabled/$DOMAIN ]; then
    ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
fi

# Set up SSL with Let's Encrypt if not already set up
if [ ! -d /etc/letsencrypt/live/$DOMAIN ]; then
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
fi

# Report status
echo "Checking Docker containers status:"
docker compose ps
EOF

step "Deployment completed successfully!"
echo "Your game server is now running at: https://$DOMAIN"
echo ""
echo "To monitor logs: ssh ${VPS_USER}@${VPS_IP} \"cd $APP_DIR && docker compose logs -f\""
echo "To manually backup: ssh ${VPS_USER}@${VPS_IP} \"$APP_DIR/backup.sh\""
echo ""
echo "Don't forget to update your client configuration to point to your new server:"
echo "NEXT_PUBLIC_GAME_SERVER_URL=https://$DOMAIN"
