// filepath: /home/s/develop/projects/vibe/1/shared/positionUtils.ts
import { VecXZ } from './messages.js';

/**
 * Predicts the position of an entity at a given time based on its movement state
 * @param entity The entity with position and movement
 * @param timestamp The time to predict position for
 * @returns The predicted position at the given time
 */
export function predictPosition(entity: any, timestamp: number): VecXZ {
  if (!entity || !entity.position) {
    return { x: 0, z: 0 };
  }

  // If no movement or timestamp is in the past, return current position
  if (!entity.movement || 
      !entity.movement.startTime || 
      timestamp <= entity.movement.startTime) {
    return { 
      x: entity.position.x, 
      z: entity.position.z 
    };
  }

  // Calculate time elapsed since movement started
  const elapsedTimeSec = (timestamp - entity.movement.startTime) / 1000;
  
  // Calculate distance traveled
  const distanceTraveled = entity.movement.speed * elapsedTimeSec;
  
  // If no direction or speed is 0, return current position
  if (!entity.movement.dir || 
      entity.movement.speed === 0 || 
      (entity.movement.dir.x === 0 && entity.movement.dir.z === 0)) {
    return { 
      x: entity.position.x, 
      z: entity.position.z 
    };
  }
  
  // Calculate predicted position
  return {
    x: entity.position.x + entity.movement.dir.x * distanceTraveled,
    z: entity.position.z + entity.movement.dir.z * distanceTraveled
  };
}

/**
 * Calculate distance between two points in 2D space
 */
export function distance(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
