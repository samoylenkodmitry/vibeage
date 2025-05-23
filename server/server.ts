import { createServer } from 'node:http';
import { Server } from 'socket.io';
import express from 'express';
import morgan from 'morgan';
import { ZoneManager } from '../shared/zoneSystem.js';
import { initWorld } from './world.js';
import { sendCastSnapshots } from './combat/skillSystem.js';
import { RateLimiter } from './utils/rateLimiter.js';

// Create Express app
const app = express();

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

// Configure Socket.IO with improved settings
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "https://vibeage.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket'], // Prefer WebSocket only for better performance
  pingTimeout: 60000,
  pingInterval: 30000, // Increased to avoid conflict with our 30Hz update rate
  connectTimeout: 45000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8,
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

// Handle socket connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Get client IP address
  const clientIp = socket.handshake.address;

  // Handle player joining
  socket.on('joinGame', async (data: { playerName: string, clientProtocolVersion?: number }) => {
    // Apply rate limiting
    if (!joinGameLimiter.isAllowed(clientIp)) {
      console.warn(`Rate limit exceeded for ${clientIp}. Rejecting joinGame request.`);
      socket.emit('connectionRejected', { reason: 'rateLimited', message: 'Too many join attempts. Please try again later.' });
      return;
    }
    
    // Check protocol version - require v2 or higher
    const clientVersion = data.clientProtocolVersion || 1;
    if (clientVersion < 2) {
      console.warn(`Client ${socket.id} using outdated protocol version ${clientVersion}. Rejecting connection.`);
      socket.emit('connectionRejected', { reason: 'outdatedProtocol', message: 'This server requires protocol v2 or higher.' });
      socket.disconnect(true);
      return;
    }
    
    console.log(`Player joining: ${data.playerName} with protocol version ${clientVersion}`);
    
    try {
      // Add the player to the world (now async)
      const player = await world.addPlayer(socket.id, data.playerName);
      
      // Send player ID to the client
      socket.emit('joinGame', { playerId: player.id });
      
      // Send full game state to the new player
      socket.emit('gameState', world.getGameState());
      
      // Send explicit inventory update to ensure synchronization
      socket.emit('msg', {
        type: 'InventoryUpdate',
        playerId: player.id,
        inventory: player.inventory,
        maxInventorySlots: player.maxInventorySlots
      });
      
      // Send all active casts and projectiles to the new player
      sendCastSnapshots(socket);
      
      // Broadcast new player to others
      socket.broadcast.emit('playerJoined', player);
    } catch (error) {
      console.error('Error during player join:', error);
      socket.emit('connectionRejected', { reason: 'serverError', message: 'Server error during join process. Please try again.' });
    }
  });

  // Handle game state requests
  socket.on('requestGameState', () => {
    const gameState = world.getGameState();
    console.log('Client requested game state. Enemy count:', Object.keys(gameState.enemies).length);
    socket.emit('gameState', gameState);
    
    // Find the player associated with this socket and send explicit inventory update
    const playerId = Object.keys(gameState.players).find(
      id => gameState.players[id].socketId === socket.id
    );
    
    if (playerId && gameState.players[playerId]) {
      const player = gameState.players[playerId];
      socket.emit('msg', {
        type: 'InventoryUpdate',
        playerId: player.id,
        inventory: player.inventory,
        maxInventorySlots: player.maxInventorySlots
      });
    }
  });

  // Handle new message format
  socket.on('msg', (message) => {
    world.handleMessage(socket, message);
  });

  // Legacy handlers - keep for backwards compatibility
  socket.on('moveStart', (message) => {
    console.log('Legacy moveStart received - should use msg type instead');
    // Convert to new format and pass to world
    const m = {
      type: 'MoveStart',
      id: message.id,
      path: [message.to],
      speed: message.speed,
      clientTs: message.ts
    };
    world.handleMessage(socket, m);
  });

  socket.on('moveStop', (message) => {
    console.log('Legacy moveStop received - should use MoveSync instead');
    // Convert to new format and pass to world
    const m = {
      type: 'MoveSync',
      id: message.id,
      pos: message.pos,
      clientTs: message.ts
    };
    world.handleMessage(socket, m);
  });

  socket.on('castSkillRequest', (data) => {
    console.log('Legacy castSkillRequest received - should use CastReq instead');
    // Convert to new format and pass to world
    const m = {
      type: 'CastReq',
      id: Object.keys(world.getGameState().players).find(
        id => world.getGameState().players[id].socketId === socket.id
      ) || '',
      skillId: data.skillId,
      targetId: data.targetId,
      clientTs: Date.now()
    };
    world.handleMessage(socket, m);
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    
    try {
      // Remove the player from the world (now async)
      const playerId = await world.removePlayerBySocketId(socket.id);
      
      if (playerId) {
        // Broadcast player removal to all clients
        io.emit('playerLeft', playerId);
      }
    } catch (error) {
      console.error('Error during player disconnect:', error);
    }
  });
});

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
