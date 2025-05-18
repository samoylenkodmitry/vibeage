#!/bin/bash
set -e

# Configuration
VPS_IP="159.69.33.249"
VPS_USER="root"  # Adjust if you're using a different user
APP_DIR="/opt/vibeage"

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Display usage information
usage() {
  echo "Usage: $0 [COMMAND]"
  echo ""
  echo "Commands:"
  echo "  deploy        Update code and restart the server"
  echo "  logs          View server logs"
  echo "  status        Check server status"
  echo "  backup        Create a database backup"
  echo "  restart       Restart the server"
  echo "  stop          Stop the server"
  echo "  start         Start the server"
  echo ""
  exit 1
}

# Check for command argument
if [ $# -eq 0 ]; then
  usage
fi

# Process command
case "$1" in
  deploy)
    echo -e "${GREEN}Deploying latest code and restarting server...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "cd $APP_DIR && git pull && docker compose down && docker compose up -d --build"
    ;;
  logs)
    echo -e "${GREEN}Showing server logs (Ctrl+C to exit)...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "cd $APP_DIR && docker compose logs -f"
    ;;
  status)
    echo -e "${GREEN}Checking server status...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "cd $APP_DIR && docker compose ps && docker compose top"
    ;;
  backup)
    echo -e "${GREEN}Creating database backup...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "$APP_DIR/backup.sh"
    ;;
  restart)
    echo -e "${GREEN}Restarting server...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "cd $APP_DIR && docker compose restart"
    ;;
  stop)
    echo -e "${YELLOW}Stopping server...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "cd $APP_DIR && docker compose down"
    ;;
  start)
    echo -e "${GREEN}Starting server...${NC}"
    ssh ${VPS_USER}@${VPS_IP} "cd $APP_DIR && docker compose up -d"
    ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    usage
    ;;
esac

echo -e "${GREEN}Done!${NC}"
