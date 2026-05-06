# Game Server Deployment Guide

This document outlines how to deploy the dedicated game server for our multiplayer game.

## Prerequisites

- Node.js 20.x
- Docker (optional, for containerized deployment)
- A VPS with Nginx for production deployment

## Environment Variables

| Key                           | Purpose                               | Where to Set |
|-------------------------------|---------------------------------------|--------------|
| `NEXT_PUBLIC_GAME_SERVER_URL` | Front-end WebSocket endpoint          | Frontend build |
| `PORT`                        | Listening port inside container / VPS | Docker/host  |
| `WS_COMPRESSION` (`0` or `1`) | Toggle per-message deflate            | Server       |
| `CORS_ORIGINS`                | Comma-separated allowed client origins | Server       |

## Deployment Options

### 1. Standalone Node.js Deployment

```bash
# Install dependencies
pnpm install

# Build the server
pnpm build:server

# Start the server
pnpm start:server
```

### 2. Docker Deployment

```bash
# Build the Docker image
docker build -t game-server .

# Run the container
docker run -p 3001:3001 -e PORT=3001 game-server
```

### 3. VPS Deployment

Use `scripts/setup-server.sh` for the game server/database stack and `scripts/setup-client.sh` for the static frontend served by Nginx.

## Client Configuration

Set `NEXT_PUBLIC_GAME_SERVER_URL` during the frontend build. The VPS setup script does this automatically with `https://<domain>`.

## Security Considerations

The server implements basic rate limiting for game join attempts, but you may want to enhance security with:

1. JWT-based authentication
2. More comprehensive rate limiting across all endpoints
3. TLS termination (recommended to use Cloudflare or a similar service)

## Scaling Strategy

For future scaling needs:
1. Implement a Redis pub-sub layer for horizontal scaling
2. Add a persistent database (PostgreSQL) for player accounts and inventories
3. Consider splitting the server into microservices for different game functions

## Monitoring

Add application monitoring with:
- Basic health checks at `/healthz` endpoint
- Server logs output in standard format
- Consider integrating with a monitoring service like Datadog or New Relic

## Troubleshooting

- Check server logs for error messages
- Verify correct environment variables are set
- Ensure ports are properly exposed and not blocked by firewalls
- Verify WebSocket connections are allowed by your hosting provider
