#!/bin/bash
# Auto-migration script that runs after PostgreSQL starts
# This ensures migrations run on both fresh installs and updates

set -e

# Database connection settings
export PGHOST=${PGHOST:-db}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-postgres}
export PGPASSWORD=${PGPASSWORD:-postgres}
export PGDATABASE=${PGDATABASE:-postgres}

echo "[Migration] Waiting for database to be ready..."

# Wait for database to be ready
for i in {1..30}; do
    if psql -c "SELECT 1;" > /dev/null 2>&1; then
        echo "[Migration] Database is ready!"
        break
    fi
    echo "Waiting for database... ($i/30)"
    sleep 1
done

# Create migrations table if it doesn't exist
psql -c "
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);"

echo "[Migration] Checking for pending migrations..."

# Run migrations
MIGRATIONS_DIR="/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration_file" ]; then
            filename=$(basename "$migration_file")
            
            # Check if migration was already applied
            if psql -t -c "SELECT 1 FROM migrations WHERE filename = '$filename';" | grep -q 1; then
                echo "[Migration] Skipping $filename (already applied)"
            else
                echo "[Migration] Applying $filename..."
                if psql -f "$migration_file"; then
                    psql -c "INSERT INTO migrations (filename) VALUES ('$filename');"
                    echo "[Migration] Successfully applied $filename"
                else
                    echo "[Migration] ERROR: Failed to apply $filename"
                    exit 1
                fi
            fi
        fi
    done
else
    echo "[Migration] No migrations directory found"
fi

echo "[Migration] All migrations completed!"
