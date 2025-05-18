#!/bin/bash
set -e

# Make sure Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is required. Please install it first."
    exit 1
fi

# Start PostgreSQL container in the background
echo "Starting PostgreSQL for development..."
docker compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 3

# Copy the environment file to the server directory
cp server/.env.development .env

# Run the development script
echo "Starting development servers..."
pnpm run dev:all

# Cleanup function to stop PostgreSQL on script exit
cleanup() {
    echo "Stopping PostgreSQL container..."
    docker compose -f docker-compose.dev.yml down
}

# Register the cleanup function to run on script exit
trap cleanup EXIT
