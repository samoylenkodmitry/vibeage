'use client';

import { Vector3 } from 'three';

// Ground position constant
export const GROUND_Y = 0.5;

// Vector interface for XZ positions
export interface VecXZ {
  x: number;
  z: number;
}

/**
 * Simulates movement for a physics body towards a destination
 * 
 * @param body The physics body to move
 * @param dest The destination position (can be null if no movement)
 * @param speed The movement speed in units per second
 * @param delta Time elapsed since last frame in seconds
 * @returns true if movement is still in progress, false if arrived or no destination
 */
export function simulateMovement(
  body: any, // Using any for RigidBodyApi to avoid dependency issues
  dest: VecXZ | null,
  speed: number,
  delta: number
): boolean {
  // No movement if no destination
  if (!dest) return false;
  
  // Get current position
  const pos = body.translation();
  
  // Calculate direction vector to destination
  const dir = new Vector3(dest.x - pos.x, 0, dest.z - pos.z);
  
  // Calculate distance to destination
  const dist = dir.length();
  
  // If we're close enough to destination, consider it reached
  if (dist < 0.05) return false;
  
  // Normalize and scale by speed and delta time
  dir.normalize().multiplyScalar(speed * delta);
  
  // Prevent overshooting
  if (dir.length() > dist) dir.setLength(dist);
  
  // Set next position
  body.setNextKinematicTranslation({ 
    x: pos.x + dir.x, 
    y: GROUND_Y, 
    z: pos.z + dir.z 
  });
  
  // Movement is still in progress
  return true;
}

/**
 * Checks if a player has reached their destination
 * 
 * @param currentPos Current position
 * @param destPos Destination position
 * @returns true if destination is reached (or close enough)
 */
export function hasReachedDestination(currentPos: {x: number, z: number}, destPos: VecXZ | null): boolean {
  if (!destPos) return true;
  
  const dx = destPos.x - currentPos.x;
  const dz = destPos.z - currentPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  return dist < 0.05;
}
