// filepath: /home/s/develop/projects/vibe/1/server/combat/worldLoop.ts
import { Server } from 'socket.io';
import { tickCasts, tickProjectiles } from './skillManager';
import { updateProjectiles } from '../world';

// Simple world object that provides the interface needed by the skill system
export interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => any | null;
  getEntitiesInCircle: (pos: { x: number, z: number }, radius: number) => any[];
}

/**
 * Create a world loop to process skill casts and projectiles
 * 
 * @param io Socket.io server instance for broadcasting
 * @param world Game world with entity lookup methods
 * @param gameState Current game state
 */
export function setupWorldLoop(io: Server, world: World, gameState: any) {
  let lastTime = Date.now();
  
  // The game tick function that runs regularly
  function gameTick() {
    const now = Date.now();
    const deltaTime = now - lastTime;
    lastTime = now;
    
    // Process cast state machine
    tickCasts(deltaTime, io, world);
    
    // Process projectile movement and collision
    tickProjectiles(deltaTime, io, world);
    
    // Run existing projectile system (legacy mode)
    // This ensures both systems run side by side during transition
    if (typeof updateProjectiles === 'function') {
      updateProjectiles(gameState, deltaTime / 1000);
    }
  }
  
  // Run the game tick every 50ms (20 times per second)
  const tickInterval = 50;
  const intervalId = setInterval(gameTick, tickInterval);
  
  // Return a cleanup function to stop the loop
  return function cleanup() {
    clearInterval(intervalId);
  };
}
