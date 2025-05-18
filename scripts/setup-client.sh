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

step "Setting up Vibeage Game Client on $(hostname)"

# Domain prompt
read -p "Enter your domain name (default: vibeage.eu): " DOMAIN
DOMAIN=${DOMAIN:-vibeage.eu}

# Setup directories
FRONTEND_DIR="/opt/vibeage-frontend"
SERVER_DIR="/opt/vibeage"

mkdir -p $FRONTEND_DIR

# Install Node.js if not already installed
step "Checking for Node.js..."
if ! command -v node &> /dev/null; then
  step "Installing Node.js..."
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
else
  step "Node.js is already installed"
fi

# Install pnpm
step "Installing pnpm..."
npm install -g pnpm

# Clone repository (if not already cloned)
step "Setting up frontend code..."
if [ -f "$SERVER_DIR/package.json" ]; then
  step "Using existing repository in $SERVER_DIR"
  cp -r $SERVER_DIR/* $FRONTEND_DIR/
else
  step "Cloning repository to $FRONTEND_DIR..."
  git clone https://github.com/samoylenkodmitry/vibeage.git $FRONTEND_DIR
  cd $FRONTEND_DIR
  git checkout main # Use main branch for client
fi

cd $FRONTEND_DIR

# Install dependencies
step "Installing dependencies..."
pnpm install

# Build the frontend
step "Building the frontend..."
NEXT_PUBLIC_GAME_SERVER_URL="https://$DOMAIN" pnpm run build

# Configure Nginx for both client and server
step "Updating Nginx configuration..."
cat > /etc/nginx/sites-available/$DOMAIN << EOL
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend static files
    location / {
        root $FRONTEND_DIR/out;
        try_files \$uri \$uri/ /index.html;
    }
    
    # WebSocket/API endpoint
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # API fallback
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOL

# Enable the site
systemctl reload nginx

# Setup SSL with Let's Encrypt
step "Setting up SSL with Let's Encrypt..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || warn "SSL setup failed. You can run 'certbot --nginx -d $DOMAIN' manually later."

# Create a script to update the frontend
step "Creating frontend update script..."
cat > $FRONTEND_DIR/update-frontend.sh << EOL
#!/bin/bash
cd $FRONTEND_DIR
git pull
pnpm install
NEXT_PUBLIC_GAME_SERVER_URL="https://$DOMAIN" pnpm run build
systemctl reload nginx
echo "Frontend updated successfully!"
EOL
chmod +x $FRONTEND_DIR/update-frontend.sh

# Update the manager script to include frontend updates
step "Updating management script..."
cat > $SERVER_DIR/manage.sh << EOL
#!/bin/bash
case "\$1" in
  update-server)
    echo "Updating server..."
    cd $SERVER_DIR
    git pull
    docker compose down
    docker compose up -d --build
    ;;
  update-frontend)
    echo "Updating frontend..."
    $FRONTEND_DIR/update-frontend.sh
    ;;
  update-all)
    echo "Updating everything..."
    cd $SERVER_DIR
    git pull
    docker compose down
    docker compose up -d --build
    $FRONTEND_DIR/update-frontend.sh
    ;;
  logs)
    echo "Showing logs (Ctrl+C to exit)..."
    cd $SERVER_DIR
    docker compose logs -f
    ;;
  backup)
    echo "Creating backup..."
    $SERVER_DIR/backup.sh
    ;;
  status)
    echo "Server status:"
    cd $SERVER_DIR
    docker compose ps
    ;;
  *)
    echo "Usage: \$0 {update-server|update-frontend|update-all|logs|backup|status}"
    exit 1
esac
EOL
chmod +x $SERVER_DIR/manage.sh

step "🎮 Vibeage Game Client deployed successfully! 🎮"
echo
echo "Your game is now fully deployed at: https://$DOMAIN"
echo
echo "Management commands:"
echo "  $SERVER_DIR/manage.sh update-server   - Update server only"
echo "  $SERVER_DIR/manage.sh update-frontend - Update frontend only"
echo "  $SERVER_DIR/manage.sh update-all      - Update both server and frontend"
echo "  $SERVER_DIR/manage.sh logs            - View server logs"
echo "  $SERVER_DIR/manage.sh backup          - Create database backup"
echo "  $SERVER_DIR/manage.sh status          - Check server status"
