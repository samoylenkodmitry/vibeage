import { createServer } from 'node:http';
import { Server } from 'socket.io';
import express from 'express';
import morgan from 'morgan';
import { ZoneManager } from '../packages/content/zones.js';
import { initWorld } from './world.js';
import { RateLimiter } from './utils/rateLimiter.js';
import {
  isOriginAllowed,
  parseAllowedOrigins,
  parseMaxHttpBufferSize,
} from './security.js';
import { registerSocketSession } from './transport/socketSession.js';

// Create Express app
const app = express();
app.disable('x-powered-by');

// Setup request logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send({ status: 'ok', uptime: process.uptime() });
});

// Create HTTP server with Express
const httpServer = createServer(app);

// WebSocket compression config
const COMPRESSION = process.env.WS_COMPRESSION !== "0";
const CORS_ORIGINS = parseAllowedOrigins(process.env.CORS_ORIGINS);
const MAX_HTTP_BUFFER_SIZE = parseMaxHttpBufferSize(process.env.MAX_HTTP_BUFFER_SIZE);
const ALLOW_MISSING_ORIGIN = process.env.ALLOW_MISSING_ORIGIN === '1';

// Configure Socket.IO with improved settings
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  },
  allowRequest: (req, callback) => {
    const allowed = isOriginAllowed(req.headers.origin, CORS_ORIGINS, ALLOW_MISSING_ORIGIN);
    callback(null, allowed);
  },
  transports: ['websocket'], // Prefer WebSocket only for better performance
  pingTimeout: 60000,
  pingInterval: 30000, // Increased to avoid conflict with our 30Hz update rate
  connectTimeout: 45000,
  allowEIO3: true,
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
  path: '/socket.io/',
  perMessageDeflate: COMPRESSION
    ? { threshold: 0 }          // Compress everything
    : false,                    // Easy kill-switch
  httpCompression: COMPRESSION
    ? { threshold: 0 }
    : false,
});

// Initialize zone manager
const zoneManager = new ZoneManager();

// Initialize game world with the IO instance and zone manager
const world = initWorld(io, zoneManager);

// Create rate limiter for joinGame events (5 attempts per minute per IP)
const joinGameLimiter = new RateLimiter(60000, 5);

registerSocketSession(io, world, joinGameLimiter);

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

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`Game server running on port ${port}`);
      console.log(`Enemy count at startup: ${Object.keys(world.getGameState().enemies).length}`);
      console.log('Game zones:', zoneManager.getZones().map(zone => zone.name).join(', '));
      
      // Start the enhanced world loop with the game state
      console.log('Starting server-authoritative combat system...');
      
      isServerRunning = true;
      resolve();
    });
  });
}

/**
 * Stop the game server
 */
export function stopServer(): void {
  if (!isServerRunning) {
    console.warn('Server is not running');
    return;
  }


  // Close all socket connections
  io.disconnectSockets();
  
  // Close the HTTP server
  httpServer.close(() => {
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
