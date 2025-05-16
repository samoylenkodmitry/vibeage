import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ZoneManager } from '../shared/zoneSystem.js';
import { initWorld } from './world.js';
import { sendCastSnapshots } from './combat/skillSystem.js';

// Create HTTP server
const httpServer = createServer();

// WebSocket compression config
const COMPRESSION = process.env.WS_COMPRESSION !== "0";

// Configure Socket.IO with improved settings
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
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

// Handle socket connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle player joining
  socket.on('joinGame', (data: { playerName: string, clientProtocolVersion?: number }) => {
    // Check protocol version - require v2 or higher
    const clientVersion = data.clientProtocolVersion || 1;
    if (clientVersion < 2) {
      console.warn(`Client ${socket.id} using outdated protocol version ${clientVersion}. Rejecting connection.`);
      socket.emit('connectionRejected', { reason: 'outdatedProtocol', message: 'This server requires protocol v2 or higher.' });
      socket.disconnect(true);
      return;
    }
    
    console.log(`Player joining: ${data.playerName} with protocol version ${clientVersion}`);
    
    // Add the player to the world
    const player = world.addPlayer(socket.id, data.playerName);
    
    // Send player ID to the client
    socket.emit('joinGame', { playerId: player.id });
    
    // Send full game state to the new player
    socket.emit('gameState', world.getGameState());
    
    // Send all active casts and projectiles to the new player
    sendCastSnapshots(socket);
    
    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', player);
  });

  // Handle game state requests
  socket.on('requestGameState', () => {
    const gameState = world.getGameState();
    console.log('Client requested game state. Enemy count:', Object.keys(gameState.enemies).length);
    socket.emit('gameState', gameState);
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
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove the player from the world
    const playerId = world.removePlayerBySocketId(socket.id);
    
    if (playerId) {
      // Broadcast player removal to all clients
      io.emit('playerLeft', playerId);
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
