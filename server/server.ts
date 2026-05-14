import { createServer } from 'node:http';
import express from 'express';
import morgan from 'morgan';
import {
  createEndpoint,
  createRouter,
  getBearerToken,
  matchMaker,
  Server as ColyseusServer,
} from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  isOriginAllowed,
  parseAllowedOrigins,
  parseMaxHttpBufferSize,
} from './security.js';
import { VibeAgeRoom } from './transport/vibeAgeRoom.js';
import { runtimeMetrics } from './observability/runtimeMetrics.js';

// Create Express app
const app = express();
app.disable('x-powered-by');

// Setup request logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send({ status: 'ok', uptime: process.uptime() });
});

app.get('/runtimez', (req, res) => {
  res.status(200).send(runtimeMetrics.snapshot());
});

// Create HTTP server with Express
const httpServer = createServer(app);

const COMPRESSION = process.env.WS_COMPRESSION !== "0";
const CORS_ORIGINS = parseAllowedOrigins(process.env.CORS_ORIGINS);
const MAX_HTTP_BUFFER_SIZE = parseMaxHttpBufferSize(process.env.MAX_HTTP_BUFFER_SIZE);
const ALLOW_MISSING_ORIGIN = process.env.ALLOW_MISSING_ORIGIN === '1';

const gameServer = new ColyseusServer({
  greet: false,
  transport: new WebSocketTransport({
    server: httpServer,
    maxPayload: MAX_HTTP_BUFFER_SIZE,
    pingInterval: 30_000,
    pingMaxRetries: 2,
    perMessageDeflate: COMPRESSION ? { threshold: 0 } : false,
    verifyClient(info, callback) {
      callback(isOriginAllowed(info.origin, CORS_ORIGINS, ALLOW_MISSING_ORIGIN));
    },
  }),
});

gameServer.router = createRouter({
  postColyseusPathMatchmake: createEndpoint('/colyseus/matchmake/:method/:roomName', { method: 'POST' }, async (ctx) => {
    const response = await matchMaker.controller.invokeMethod(
      ctx.params.method,
      ctx.params.roomName,
      ctx.body,
      {
        token: getBearerToken(ctx.request.headers.get('authorization')),
        headers: ctx.request.headers,
        ip: ctx.request.headers.get('x-forwarded-for')
          ?? ctx.request.headers.get('x-client-ip')
          ?? ctx.request.headers.get('x-real-ip'),
        req: ctx.request,
      },
    );
    const body = JSON.stringify(response);

    return new Response(body, {
      headers: {
        'content-type': 'application/json',
        'content-length': body.length.toString(),
      },
    });
  }),
});

gameServer.define('world', VibeAgeRoom);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

// Variables to track server state
let isServerRunning = false;

/**
 * Start the game server on the specified port
 * @param port Port number to listen on
 * @returns Promise that resolves when server is started
 */
export async function startServer(port: number = 3001): Promise<void> {
  if (isServerRunning) {
    console.warn('Server is already running');
    return;
  }

  await gameServer.listen(port);
  console.log(`Game server running on port ${port}`);
  console.log('Starting Colyseus authoritative room transport...');
  isServerRunning = true;
}

/**
 * Stop the game server
 */
export function stopServer(): void {
  if (!isServerRunning) {
    console.warn('Server is not running');
    return;
  }


  gameServer.gracefullyShutdown(false).finally(() => {
    console.log('Game server stopped');
    isServerRunning = false;
  });
}

// Start the server if this module is run directly
// In ESM, import.meta.url will be the URL of the current module
// and we can check if it's being run directly
if (import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ''))) {
  const PORT = process.env.PORT || 3001;
  startServer(Number(PORT)).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Let the process exit to trigger container restart if needed
  process.exit(1);
});
