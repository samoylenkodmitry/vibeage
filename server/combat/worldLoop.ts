import { Server } from 'socket.io';
import { tickCasts, sendCastSnapshots } from './skillSystem.js';  // New skill system
import { broadcastSnaps } from '../world.js';
import { VecXZ } from '../../shared/messages.js';
import { StatusEffectManager } from './StatusEffectManager'; // Import the StatusEffectManager

// Game state reference
let gameState: any = null;
let isRunning = false;
let loopInterval: NodeJS.Timeout | null = null;
let updateProjectilesLegacy: ((gameState: any, deltaTime: number) => void) | null = null;

// Track time
let lastTime = Date.now();
let lastSnapBroadcastTime = Date.now();
let lastCastSnapshotTime = Date.now();

// Reference to IO server
let ioServer: Server | null = null;

// Status effect manager instance
let statusEffectManager: StatusEffectManager | null = null;

// World interface implementation
const world = {
  getEnemyById: (id: string) => {
    if (!gameState || !gameState.enemies) return null;
    return gameState.enemies[id] || null;
  },
  
  getPlayerById: (id: string) => {
    if (!gameState || !gameState.players) return null;
    return gameState.players[id] || null;
  },
  
  getEntitiesInCircle: (pos: VecXZ, radius: number) => {
    const result: any[] = [];
    
    // Check enemies
    if (gameState && gameState.enemies) {
      for (const enemyId in gameState.enemies) {
        const enemy = gameState.enemies[enemyId];
        if (!enemy.isAlive) continue;
        
        const dx = enemy.position.x - pos.x;
        const dz = enemy.position.z - pos.z;
        const distSq = dx * dx + dz * dz;
        
        if (distSq <= radius * radius) {
          result.push(enemy);
        }
      }
    }
    
    // Check players (for PvP if enabled)
    if (gameState && gameState.players) {
      for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (!player.isAlive) continue;
        
        const dx = player.position.x - pos.x;
        const dz = player.position.z - pos.z;
        const distSq = dx * dx + dz * dz;
        
        if (distSq <= radius * radius) {
          result.push(player);
        }
      }
    }
    
    return result;
  }
};

/**
 * The main game tick function that updates all game entities
 */
function gameTick() {
  const now = Date.now();
  const deltaTime = now - lastTime;
  lastTime = now;
  
  // Apply movement to players based on their velocities
  if (gameState?.players) {
    applyMovement(gameState.players, deltaTime);
  }
  
  // Process skills with the new skill system
  if (ioServer) {
    // Process the skill state machine
    tickCasts(deltaTime, ioServer, world);
    
    // Send cast snapshots to clients on a regular interval (20 Hz)
    if (now - lastCastSnapshotTime >= 50) {
      sendCastSnapshots(ioServer);
      lastCastSnapshotTime = now;
    }
  }
  
  // Process status effects on entities
  if (ioServer && gameState && statusEffectManager) {
    const currentWorldState = {
      players: gameState.players,
      enemies: gameState.enemies,
    };
    statusEffectManager.update(deltaTime, currentWorldState, ioServer);
  }
  
  // Process any pending loot results from enemy deaths
  processLootResults();
  
  // Run existing projectile system (legacy mode) if it exists
  // This ensures both systems run side by side during transition
  if (updateProjectilesLegacy && typeof updateProjectilesLegacy === 'function' && gameState) {
    updateProjectilesLegacy(gameState, deltaTime / 1000);
  }
  
  // Broadcast position snapshots at 10 Hz (every 100ms)
  if (ioServer && gameState && now - lastSnapBroadcastTime >= 100) {
    // Call the broadcastSnaps function from world.ts
    if (typeof broadcastSnaps === 'function') {
      broadcastSnaps(ioServer, gameState);
      lastSnapBroadcastTime = now;
    }
  }
  
  // Process any pending loot results from enemy deaths
  processLootResults();
}

/**
 * Applies movement updates to player entities based on their velocity
 */
function applyMovement(players: Record<string, any>, deltaTimeMs: number) {
  if (!players) return;
  
  const now = Date.now();
  const dt = deltaTimeMs / 1000; // Convert to seconds
  
  for (const player of Object.values(players)) {
    if (!player.movement?.isMoving) continue;
    
    // Apply velocity to position
    if (player.velocity) {
      player.position.x += player.velocity.x * dt;
      player.position.z += player.velocity.z * dt;
      
      // Check if we've reached the target position
      if (player.movement.targetPos) {
        const distance = Math.sqrt(
          Math.pow(player.position.x - player.movement.targetPos.x, 2) +
          Math.pow(player.position.z - player.movement.targetPos.z, 2)
        );
        
        // If close enough to target, stop moving
        if (distance < 0.1) {
          player.movement.isMoving = false;
          player.velocity = { x: 0, z: 0 };
        }
      }
      
      player.movement.lastUpdateTime = now;
    }
  }
}

/**
 * Process any pending loot results from enemy deaths
 */
function processLootResults() {
  if (!ioServer || !gameState) return;
  
  // Check each enemy for loot results
  for (const enemyId in gameState.enemies) {
    const enemy = gameState.enemies[enemyId];
    
    // Skip enemies without loot results
    if (!enemy.lootResult) continue;
    
    const { inventoryUpdate, lootAcquired } = enemy.lootResult;
    
    if (inventoryUpdate) {
      const playerId = inventoryUpdate.playerId;
      const player = gameState.players[playerId];
      
      if (player) {
        // Find the player's socket
        for (const socketId in ioServer.sockets.sockets) {
          const socket = ioServer.sockets.sockets[socketId];
          
          if (socket && player.socketId === socketId) {
            // Send inventory update
            socket.emit('msg', {
              type: 'InventoryUpdate',
              inventory: inventoryUpdate.inventory,
              maxInventorySlots: inventoryUpdate.maxInventorySlots
            });
            
            // Send loot acquired notification if available
            if (lootAcquired) {
              socket.emit('msg', {
                type: 'LootAcquired',
                items: lootAcquired.items,
                sourceEnemyName: lootAcquired.sourceEnemyName
              });
            }
            
            break;
          }
        }
      }
    }
    
    // Clear the loot result to prevent resending
    delete enemy.lootResult;
  }
}

/**
 * Start the game loop
 * @param tickRateMs How often to run the game loop in milliseconds
 */
export function startWorldLoop(
  io: Server, 
  state: any, 
  updateProjectilesFn?: ((gameState: any, deltaTime: number) => void) | null,
  tickRateMs: number = 50 // Default to 20 ticks per second
) {
  // Store references
  ioServer = io;
  gameState = state;
  updateProjectilesLegacy = updateProjectilesFn || null;
  
  // Initialize time
  lastTime = Date.now();
  lastCastSnapshotTime = Date.now();
  lastSnapBroadcastTime = Date.now();
  
  // Initialize the status effect manager
  statusEffectManager = new StatusEffectManager();
  
  // Start the loop if not already running
  if (!isRunning) {
    isRunning = true;
    
    // Clear any existing interval
    if (loopInterval) {
      clearInterval(loopInterval);
    }
    
    // Start the new interval
    loopInterval = setInterval(gameTick, tickRateMs);
    console.log(`World loop started with new server-authoritative skill system, tick rate: ${tickRateMs}ms`);
  }
}

/**
 * Stop the game loop
 */
export function stopWorldLoop() {
  if (isRunning && loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
    isRunning = false;
    console.log('World loop stopped');
  }
}

/**
 * Update the game state reference
 */
export function updateGameState(newState: any) {
  gameState = newState;
}

/**
 * Check if the world loop is currently running
 */
export function isWorldLoopRunning(): boolean {
  return isRunning;
}
