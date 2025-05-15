import { io as Client } from 'socket.io-client';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { startServer, stopServer } from '../server.js';

describe('Combat Protocol V2', () => {
  let clientSocket: any;
  let serverPort: number;
  let capturedMessages: any[] = [];
  
  beforeEach(async () => {
    // Start the server on a random port
    serverPort = 3000 + Math.floor(Math.random() * 1000);
    try {
      await Promise.race([
        startServer(serverPort),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Server start timeout')), 5000))
      ]);
      
      // Create a client that connects to the server
      clientSocket = Client(`http://localhost:${serverPort}`);
      
      // Wait for the connection to be established with timeout
      await Promise.race([
        new Promise<void>((resolve) => {
          clientSocket.on('connect', () => resolve());
        }),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 2000))
      ]);
      
      // Reset captured messages
      capturedMessages = [];
      
      // Join the game with protocol version 2
      clientSocket.emit('joinGame', { 
        playerName: 'TestPlayer',
        clientProtocolVersion: 2 
      });
      
      // Wait for join confirmation with timeout
      await Promise.race([
        new Promise<void>((resolve) => {
          clientSocket.on('joinGame', (data: any) => {
            console.log('Joined game with id:', data.playerId);
            resolve();
          });
        }),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Join game timeout')), 2000))
      ]);
      
      // Setup message capture
      clientSocket.on('msg', (msg: any) => {
        capturedMessages.push(msg);
      });
    } catch (error) {
      console.error('Setup error:', error);
      throw error;
    }
  }, 15000);
  
  afterEach(() => {
    // Disconnect client
    if (clientSocket) {
      clientSocket.disconnect();
    }
    
    // Stop server
    stopServer();
  });
  
  it.skip('should reject clients with protocol version < 2', async () => {
    // Create a new client with outdated protocol
    const outdatedClient = Client(`http://localhost:${serverPort}`);
    
    // Setup rejection capture
    const rejectionPromise = Promise.race([
      new Promise((resolve) => {
        outdatedClient.on('connectionRejected', (data) => {
          resolve(data);
        });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Rejection timeout')), 3000))
    ]);
    
    // Join with outdated protocol
    outdatedClient.emit('joinGame', { 
      playerName: 'OutdatedClient',
      clientProtocolVersion: 1 
    });
    
    // Wait for rejection
    const rejectionData: any = await rejectionPromise;
    expect(rejectionData.reason).toBe('outdatedProtocol');
    
    // Disconnect outdated client
    outdatedClient.disconnect();
  }, 10000);
  
  it.skip('should only send allowed message types after a full combat sequence', async () => {
    try {
      // Find an enemy to target
      await Promise.race([
        new Promise<void>((resolve) => {
          clientSocket.on('gameState', (gameState: any) => {
            const enemies = Object.values(gameState.enemies || {});
            console.log(`Received game state with ${enemies.length} enemies`);
            resolve();
          });
          
          clientSocket.emit('requestGameState');
        }),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Game state timeout')), 3000))
      ]);
      
      // Wait a bit for server state to be fully loaded
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send a CastReq for a fireball
      const castReq = {
        type: 'CastReq',
        id: clientSocket.id, // This will be replaced by server with actual player ID
        skillId: 'fireball',
        clientTs: Date.now()
      };
      
      console.log('Sending CastReq:', castReq);
      clientSocket.emit('msg', castReq);
      
      // Wait for 2 seconds to collect all combat messages
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check that only allowed message types were sent
      const allowedTypes = [
        'CastSnapshot', 
        'EffectSnapshot', 
        'CombatLog', 
        'PosSnap', 
        'PosDelta', 
        'EnemyAttack'
      ];
      
      const legacyTypes = [
        'skillEffect',
        'ProjSpawn2',
        'ProjHit2'
      ];
      
      // Print all captured message types
      const messageTypes = capturedMessages.map(msg => msg.type);
      console.log('Captured message types:', messageTypes);
      
      // Check that we captured some messages
      expect(capturedMessages.length).toBeGreaterThan(0);
      
      // Check that no legacy types were used
      for (const msg of capturedMessages) {
        expect(legacyTypes.includes(msg.type)).toBe(false);
        
        // Check message is one of the allowed types
        expect(allowedTypes.includes(msg.type) || 
              msg.type === 'gameState' || 
              msg.type === 'playerJoined').toBe(true);
      }
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  }, 10000);
});

// Helper function for starting/stopping the server in tests
export function assertNoLegacyEmit(io: Server): void {
  const originalEmit = io.emit;
  
  io.emit = function(event: string, ...args: any[]) {
    // Check for forbidden event types
    if (event === 'skillEffect') {
      throw new Error(`Forbidden legacy event emitted: ${event}`);
    }
    
    if (event === 'msg') {
      const msg = args[0];
      if (msg && (msg.type === 'ProjSpawn2' || msg.type === 'ProjHit2')) {
        throw new Error(`Forbidden legacy message type emitted: ${msg.type}`);
      }
    }
    
    return originalEmit.apply(this, [event, ...args]);
  };
}
