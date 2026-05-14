# Game Server Deployment Guide

This document outlines the current server deployment shape. Production uses the local-initiated VPS deploy in `DEPLOYMENT.md`.

## Prerequisites

- Node.js 20.x
- Docker (optional, for containerized deployment)
- A VPS with Nginx for production deployment

## Environment Variables

| Key | Purpose | Where to set |
| --- | --- | --- |
| `VITE_GAME_SERVER_URL` | Optional browser endpoint when the game server is not same-origin. | Frontend build |
| `GAME_SERVER_PROXY_TARGET` | Local Vite dev proxy target for `/colyseus` and `/healthz`. | Local dev |
| `PORT` | Server listen port inside container / VPS. | Docker/host |
| `WS_COMPRESSION` (`0` or `1`) | Toggle per-message deflate. | Server |
| `CORS_ORIGINS` | Comma-separated allowed browser origins. | Server |

## Deployment Options

### 1. Standalone Node.js Deployment

```bash
# Install dependencies
pnpm install

# Build the server
pnpm run build:server

# Start the server
pnpm run start:server
```

### 2. Docker Deployment

```bash
# Build the Docker image
docker build -t game-server .

# Run the container
docker run -p 3001:3001 -e PORT=3001 game-server
```

### 3. VPS Deployment

Use the current local-initiated production deploy:

```bash
pnpm run deploy:production
```

`scripts/setup-server.sh` and `scripts/setup-client.sh` are bootstrap-era scripts. Do not use them as the update path on the live VPS.

## Client Configuration

For the Vite client, set `VITE_GAME_SERVER_URL` only when the game server is not same-origin. Production browser traffic normally goes through `https://vibeage.eu` and its `/colyseus/` proxy.

## Security Considerations

The server validates Colyseus message payloads, checks socket ownership for player commands, restricts CORS origins, and disables `x-powered-by`. Possible next steps:

1. JWT-based authentication
2. More comprehensive rate limiting across HTTP and matchmaker endpoints
3. External monitoring and alerting

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
