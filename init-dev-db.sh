#!/bin/bash
set -e

# Check if PostgreSQL server is running by attempting to connect
if ! pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
    echo "PostgreSQL server is not running. Please start it with 'docker compose -f docker-compose.dev.yml up -d'"
    exit 1
fi

# Initialize the database with the schema
echo "Initializing database schema..."
psql postgres://postgres:postgres@localhost:5432/postgres -f scripts/init.sql

echo "Database initialized successfully."
echo "You can now run 'pnpm run dev:all' to start the development servers."
