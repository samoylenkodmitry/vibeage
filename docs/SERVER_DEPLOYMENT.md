# Game Server Deployment Guide

This document outlines how to deploy the dedicated game server for our multiplayer game.

## Prerequisites

- Node.js 20.x
- Docker (optional, for containerized deployment)
- A hosting platform (VPS, Railway, Fly.io, etc.)

## Environment Variables

| Key                           | Purpose                               | Where to Set |
|-------------------------------|---------------------------------------|--------------|
| `NEXT_PUBLIC_GAME_SERVER_URL` | Front-end WebSocket endpoint          | Vercel       |
| `PORT`                        | Listening port inside container / VPS | Docker/host  |
| `WS_COMPRESSION` (`0` or `1`) | Toggle per-message deflate            | Server       |

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

### 3. Platform-Specific Deployment

#### Railway

1. Connect your GitHub repository
2. Set environment variables (PORT will be set automatically)
3. Deploy

#### Fly.io

1. Install the Fly CLI
2. Run `fly launch`
3. Set secrets: `fly secrets set PORT=3001`
4. Deploy: `fly deploy`

## Client Configuration

Make sure to set the `NEXT_PUBLIC_GAME_SERVER_URL` environment variable in your Vercel project settings to point to your deployed game server's URL.

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
