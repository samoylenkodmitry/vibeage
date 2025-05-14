import { useState, useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Hook for calculating projectile movement based on the server's expected trajectory.
 * Uses precise timing to ensure client-server consistency.
 */
interface Params {
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  speed: number;
  launchTs: number;
}

const useProjectileMovement = ({
  origin,
  dir,
  speed,
  launchTs,
  gravity = 0,
  shouldAutoDestroy = false, // Changed default to false - projectiles should be controlled by server state
  maxDistance = 100,
  onDestroy
}: Params & {
  gravity?: number;
  shouldAutoDestroy?: boolean;
  maxDistance?: number;
  onDestroy?: () => void;
}) => {
  // Create stable references for the initial values
  const originalOrigin = useRef(new Vector3(origin.x, origin.y, origin.z));
  const originalDir = useRef(new Vector3(dir.x, dir.y, dir.z).normalize());
  const originalSpeed = useRef(speed);
  
  // Store the server epoch launchTs directly
  const originalLaunchTs = useRef(launchTs);
  
  // Use state for the current position so renders will happen when it updates
  const [currentPosition, setCurrentPosition] = useState(new Vector3(origin.x, origin.y, origin.z));
  
  // Additional refs for tracking distance, etc.
  const totalDistance = useRef(0);
  const isDestroyed = useRef(false);
  
  // Initial debug log when projectile is created
  useEffect(() => {
    console.log(`[ProjMove] New projectile created:`, {
      origin: `(${origin?.x?.toFixed(2) || 'undefined'}, ${origin?.y?.toFixed(2) || 'undefined'}, ${origin?.z?.toFixed(2) || 'undefined'})`,
      dir: `(${dir?.x?.toFixed(2) || 'undefined'}, ${dir?.y?.toFixed(2) || 'undefined'}, ${dir?.z?.toFixed(2) || 'undefined'})`,
      speed: speed,
      originalTs: launchTs,
      now: Date.now()
    });
    
    console.log(`[ProjMove Hook] Initialized for a projectile. Origin: (${origin?.x?.toFixed(2)}, ${origin?.y?.toFixed(2)}, ${origin?.z?.toFixed(2)}), Dir: (${dir?.x?.toFixed(2)}, ${dir?.y?.toFixed(2)}, ${dir?.z?.toFixed(2)}), Speed: ${speed}, LaunchTs: ${launchTs}, ServerEpochTs: ${originalLaunchTs.current}`);
  }, [origin, dir, speed, launchTs]);
  
  // Function to calculate position at a given time
  const calculatePosition = (elapsedTimeSeconds: number) => {
    // Calculate the base motion (direction * speed * time)
    const position = new Vector3().copy(originalOrigin.current);
    const movement = new Vector3()
      .copy(originalDir.current)
      .multiplyScalar(originalSpeed.current * elapsedTimeSeconds);
    
    // Apply movement
    position.add(movement);
    
    // Apply gravity if specified (gravity * time^2 / 2)
    if (gravity !== 0) {
      position.y -= 0.5 * gravity * elapsedTimeSeconds * elapsedTimeSeconds;
    }
    
    // Calculate total distance traveled
    const distanceTraveled = originalSpeed.current * elapsedTimeSeconds;
    totalDistance.current = distanceTraveled;
    
    return position;
  };
  
  // Update position each frame
  useFrame(() => {
    if (isDestroyed.current) return;
    
    // Calculate elapsed time in seconds since launch using epoch time
    const clientNowEpoch = Date.now();
    
    // Handle case where launchTs might be in the future due to clock mismatch
    // or using a server timestamp that's ahead of client clock
    let elapsedTimeSeconds = Math.max(0, (clientNowEpoch - originalLaunchTs.current) / 1000);
    
    // Sanity check: if elapsed time is too large or negative, use a small value
    // and auto-destroy the projectile if it's been alive for more than 5 seconds
    if (elapsedTimeSeconds < 0 || elapsedTimeSeconds > 5) {
      console.warn(`[ProjMove] Excessive elapsed time: ${elapsedTimeSeconds?.toFixed(3) || 'undefined'}s. Auto-destroying projectile.`);
      
      // Auto-destroy the projectile since it's been alive too long
      isDestroyed.current = true;
      if (onDestroy) onDestroy();
      
      // Use a reasonable fallback for final position calculation
      elapsedTimeSeconds = Math.min(5, Math.max(0, elapsedTimeSeconds));
    }
    
    // Calculate new position
    const newPosition = calculatePosition(elapsedTimeSeconds);
    
    // Debug logging to track position calculations (only log occasionally to reduce spam)
    if (Math.random() < 0.05) { // Log roughly 5% of frames
      console.log(`[ProjMove] Elapsed: ${elapsedTimeSeconds.toFixed(3)}, NewPos: (${newPosition?.x?.toFixed(2) || 'undefined'}, ${newPosition?.y?.toFixed(2) || 'undefined'}, ${newPosition?.z?.toFixed(2) || 'undefined'})`);
    }
    
    // Enhanced hook logging (in addition to existing logs)
    if (Math.random() < 0.02) { // Reduce log frequency
      console.log(`[ProjMove Hook] Update. Elapsed: ${elapsedTimeSeconds?.toFixed(3)}, NewPos: (${newPosition?.x?.toFixed(2)}, ${newPosition?.y?.toFixed(2)}, ${newPosition?.z?.toFixed(2)})`);
    }
    
    // Only update position if it has actually changed to prevent infinite updates
    if (!currentPosition.equals(newPosition)) {
      setCurrentPosition(newPosition);
    }
    
    // Check if projectile should be destroyed
    if (shouldAutoDestroy && totalDistance.current >= maxDistance) {
      console.log(`[ProjMove Hook] Auto-destroying projectile. Distance: ${totalDistance.current.toFixed(2)} >= ${maxDistance}`);
      isDestroyed.current = true;
      if (onDestroy) onDestroy();
    }
  });
  
  // Expose methods to manually destroy the projectile
  const destroy = () => {
    if (!isDestroyed.current) {
      isDestroyed.current = true;
      if (onDestroy) onDestroy();
    }
  };
  
  return {
    position: currentPosition,
    isDestroyed: isDestroyed.current,
    destroy,
    totalDistance: totalDistance.current
  };
};

export default useProjectileMovement;
