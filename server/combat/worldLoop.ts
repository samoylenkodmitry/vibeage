// filepath: /home/s/develop/projects/vibe/1/server/combat/worldLoop.ts
import { Server } from 'socket.io';
import { tickCasts, tickProjectiles, updateCasts } from './skillManager';

// Game state reference
let gameState: any = null;
let updateProjectilesLegacy: ((gameState: any, deltaTime: number) => void) | null = null;

// Track time
let lastTime = Date.now();
let isRunning = false;
let loopInterval: NodeJS.Timeout | null = null;

// Reference to IO server
let ioServer: Server | null = null;

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
  
  getEntitiesInCircle: (pos: { x: number, z: number }, radius: number) => {
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
  
  // Process cast state machine for the new system
  if (ioServer) {
    tickCasts(deltaTime, ioServer, world);
    
    // Process projectile movement and collision for the new system
    tickProjectiles(deltaTime, ioServer, world);
  }
  
  // Legacy system integration
  // Update the casts in the legacy system
  if (ioServer) {
    updateCasts(ioServer, gameState?.players);
  } else {
    updateCasts(undefined, gameState?.players);
  }
  
  // Run existing projectile system (legacy mode) if it exists
  // This ensures both systems run side by side during transition
  if (updateProjectilesLegacy && typeof updateProjectilesLegacy === 'function' && gameState) {
    updateProjectilesLegacy(gameState, deltaTime / 1000);
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
  
  // Start the loop if not already running
  if (!isRunning) {
    isRunning = true;
    
    // Clear any existing interval
    if (loopInterval) {
      clearInterval(loopInterval);
    }
    
    // Start the new interval
    loopInterval = setInterval(gameTick, tickRateMs);
    console.log(`World loop started with tick rate: ${tickRateMs}ms`);
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
