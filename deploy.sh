#!/bin/bash
# Helper script for deploying the game server

# Default action
ACTION=${1:-"help"}

case "$ACTION" in
  "build")
    echo "Building Docker images..."
    docker compose build
    ;;
    
  "up")
    echo "Starting services in detached mode..."
    docker compose up -d
    ;;
    
  "down")
    echo "Stopping all services..."
    docker compose down
    ;;
    
  "logs")
    echo "Displaying logs..."
    docker compose logs -f
    ;;
    
  "restart")
    echo "Restarting services..."
    docker compose restart
    ;;
    
  "db-backup")
    echo "Creating database backup..."
    docker compose exec db /bin/sh -c "pg_dump -U postgres -Fc postgres > /var/lib/postgresql/data/backup_\$(date +%Y%m%d_%H%M%S).dump"
    echo "Backup created in the database volume"
    ;;

  "db-shell")
    echo "Opening PostgreSQL shell..."
    docker compose exec db psql -U postgres
    ;;
    
  "help")
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build       - Build Docker images"
    echo "  up          - Start services in detached mode"
    echo "  down        - Stop all services"
    echo "  logs        - View logs"
    echo "  restart     - Restart all services"
    echo "  db-backup   - Create a database backup"
    echo "  db-shell    - Open PostgreSQL shell"
    echo "  help        - Show this help message"
    ;;
    
  *)
    echo "Unknown command: $ACTION"
    echo "Run './deploy.sh help' for usage information"
    exit 1
    ;;
esac
