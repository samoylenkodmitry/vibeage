#!/bin/bash
# Database debugging script

echo "=== Docker Compose Status ==="
docker compose ps

echo -e "\n=== Database Container Logs ==="
docker compose logs db --tail 20

echo -e "\n=== Migration Container Logs ==="
docker compose logs migrate

echo -e "\n=== Game Container Logs ==="
docker compose logs game --tail 20

echo -e "\n=== Database Connection Test ==="
docker compose exec db psql -U postgres -d postgres -c "SELECT version();" || echo "Database connection failed"

echo -e "\n=== Available Tables ==="
docker compose exec db psql -U postgres -d postgres -c "\dt" || echo "Failed to list tables"

echo -e "\n=== Players Table Structure ==="
docker compose exec db psql -U postgres -d postgres -c "\d players" || echo "Players table does not exist"

echo -e "\n=== Server Events Table Structure ==="
docker compose exec db psql -U postgres -d postgres -c "\d server_events" || echo "Server events table does not exist"

echo -e "\n=== Applied Migrations ==="
docker compose exec db psql -U postgres -d postgres -c "SELECT * FROM migrations ORDER BY applied_at;" || echo "No migrations table or no migrations applied"

echo -e "\n=== Recent Server Events ==="
docker compose exec db psql -U postgres -d postgres -c "SELECT * FROM server_events ORDER BY created_at DESC LIMIT 5;" || echo "Cannot query server events"
