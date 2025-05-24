import * as THREE from 'three';
import { getBuffer } from '../../systems/interpolation';
import type { EnemyInterpolationParams } from './types';

/**
 * Handles smooth enemy movement interpolation with performance optimizations
 */
export function useEnemyInterpolation({
  delta,
  enemyId,
  position,
  rotation,
  rigidBodyRef,
  isAlive
}: EnemyInterpolationParams) {
  if (!isAlive || !rigidBodyRef.current) return;
  
  // Get the interpolation buffer for this enemy
  const buffer = getBuffer(enemyId);
  
  // Sample the buffer with renderTs (current time minus interpolation delay)
  const renderTs = performance.now() - 100; // 100ms interpolation delay
  const serverInterpolatedSnap = buffer.sample(renderTs);
  
  if (serverInterpolatedSnap) {
    // Get target position from the snapshot
    const targetPos = new THREE.Vector3(
      serverInterpolatedSnap.pos.x,
      position.y, // Keep Y coordinate the same
      serverInterpolatedSnap.pos.z
    );
    
    // Get rotation from the snapshot if available
    const targetRotY = serverInterpolatedSnap.rot !== undefined 
      ? serverInterpolatedSnap.rot 
      : rotation?.y || 0;
    
    // Get current position
    const currentPos = new THREE.Vector3(
      rigidBodyRef.current.translation().x,
      position.y,
      rigidBodyRef.current.translation().z
    );
    
    const distance = currentPos.distanceTo(targetPos);
    
    // If we're far away from the target position, teleport
    if (distance > 5) {
      rigidBodyRef.current.setNextKinematicTranslation(targetPos);
      // Update rotation immediately on teleport
      rigidBodyRef.current.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, targetRotY, 0)
      ));
    } else {
      // Smooth interpolation - blend current position with target position with performance optimization
      const lerpFactor = Math.min(delta * 8, 1); // Reduced from 10 for less aggressive interpolation
      
      // Create interpolated position
      const newPos = new THREE.Vector3().lerpVectors(currentPos, targetPos, lerpFactor);
      
      // Set kinematic position for next frame
      rigidBodyRef.current.setNextKinematicTranslation(newPos);
      
      // Smoothly interpolate rotation with reduced frequency
      const currentRotation = rigidBodyRef.current.rotation();
      const currentEuler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w)
      );
      
      // Interpolate rotation with reduced aggressiveness
      const newRotY = THREE.MathUtils.lerp(currentEuler.y, targetRotY, lerpFactor * 0.6); // Reduced from 0.8
      
      // Set kinematic rotation for next frame
      rigidBodyRef.current.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, newRotY, 0)
      ));
    }
  }
}

/**
 * Utility function to get proper capitalized mob name
 */
export function getMobName(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
