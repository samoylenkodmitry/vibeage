import { useFrame } from '@react-three/fiber';
import { useCallback } from 'react';
import { Object3D, Vector3 } from 'three';
import { 
  Vector3Pool, 
  logClientPoolStats 
} from '../utils/ClientObjectPool';

export interface ProjectileInstance {
  id: string;
  skillId: string;
  object: Object3D;
  position: Vector3;
  updateFn: (deltaTime: number, elapsedTime: number) => boolean; // returns false if should be removed
}

class ProjectileSystemManager {
  private instances = new Map<string, ProjectileInstance>();
  private frameCount = 0;
  private lastStatsReport = 0;
  
  register(instance: ProjectileInstance) {
    this.instances.set(instance.id, instance);
  }
  
  unregister(id: string) {
    this.instances.delete(id);
  }
  
  update(deltaTime: number, elapsedTime: number) {
    // Throttle updates to 30Hz instead of 60Hz
    this.frameCount++;
    if (this.frameCount % 2 !== 0) return;
    
    const toRemove: string[] = [];
    
    for (const [id, instance] of this.instances) {
      try {
        const shouldKeep = instance.updateFn(deltaTime, elapsedTime);
        if (!shouldKeep) {
          toRemove.push(id);
        }
      } catch (error) {
        console.error(`[ProjectileSystem] Error updating instance ${id}:`, error);
        toRemove.push(id);
      }
    }
    
    // Clean up instances that should be removed
    toRemove.forEach(id => this.unregister(id));
    
    // Report pool statistics every 5 seconds
    if (elapsedTime - this.lastStatsReport > 5) {
      this.lastStatsReport = elapsedTime;
      logClientPoolStats();
    }
  }
  
  getActiveCount() {
    return this.instances.size;
  }
  
  // Utility method to get pooled Vector3 for calculations
  getPooledVector3(x: number = 0, y: number = 0, z: number = 0): Vector3 {
    return Vector3Pool.acquire().set(x, y, z);
  }
  
  // Utility method to release pooled Vector3
  releaseVector3(vector: Vector3): void {
    Vector3Pool.release(vector);
  }
}

const projectileSystemManager = new ProjectileSystemManager();

/**
 * Centralized projectile system hook that replaces individual useFrame hooks
 * in VFX components. This reduces the number of render callbacks from 
 * O(projectiles) to O(1).
 */
export function useProjectileSystem() {
  useFrame((state, deltaTime) => {
    projectileSystemManager.update(deltaTime, state.clock.elapsedTime);
  });
  
  const registerProjectile = useCallback((instance: ProjectileInstance) => {
    projectileSystemManager.register(instance);
    return () => projectileSystemManager.unregister(instance.id);
  }, []);
  
  return {
    registerProjectile,
    getActiveCount: () => projectileSystemManager.getActiveCount()
  };
}

export { projectileSystemManager };
