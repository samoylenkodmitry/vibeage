import { create } from 'zustand';
import { CastSnapshot } from '../../../shared/types';

// Define a simplified projectile data structure for protocol v2+
export interface ProjectileData {
  type: 'CastSnapshot';
  castId: string;
  skillId: string;
  casterId: string;
  origin: { x: number, z: number };
  pos: { x: number, z: number };
  velocity?: { x: number, z: number };
  travelTime?: number;
  hitTs?: number;
  expired?: boolean;
}

export interface State {
  live: Record<string, ProjectileData>;
  toRecycle: Record<string, ProjectileData>;
}

export interface Actions {
  add: (snapshot: CastSnapshot) => void;
  markProjectileAsHit: (castId: string) => void;
  cleanup: () => void;
  recycleProjectiles: (now: number) => void;
  clearRecycled: (castId: string) => void;
  getProjectileByProjId: (projId: string) => ProjectileData | undefined;
}

export const useProjectileStore = create<State & Actions>((set, get) => ({
  live: {},
  toRecycle: {},
  
  add: (snapshot) => set((s) => { 
    console.log(`[ProjectileStore.add] Adding projectile with castId: ${snapshot.castId}, skillId: ${snapshot.skillId}`);
    
    // Special logging for fireball
    if (snapshot.skillId === 'fireball') {
      console.log(`[ProjectileStore.add] Attempting to add Fireball: castId=${snapshot.castId}. Current live count: ${Object.keys(s.live).length}`);
    }
    
    // Check if this castId already exists in live projectiles
    if (s.live[snapshot.castId]) {
      console.warn(`[ProjectileStore.add] Projectile with castId: ${snapshot.castId} already exists in live projectiles. This might cause duplicate visuals.`);
      
      // Special logging for fireball
      if (snapshot.skillId === 'fireball') {
        console.warn(`[ProjectileStore.add] Fireball with castId: ${snapshot.castId} already exists. Not re-adding.`);
      }
      
      // Return the existing state with the projectile that's already in it
      return s;
    }
    
    try {
      // Special logging for fireball
      if (snapshot.skillId === 'fireball') {
        console.log(`[ProjectileStore.add] Successfully added Fireball: castId=${snapshot.castId}. New live count: ${Object.keys(s.live).length + 1}`);
      }
      
      // Create a ProjectileData object from the CastSnapshot
      const projectileData: ProjectileData = {
        type: 'CastSnapshot',
        castId: snapshot.castId,
        skillId: snapshot.skillId,
        casterId: snapshot.casterId,
        origin: snapshot.origin || snapshot.pos || { x: 0, z: 0 }, // Fallback if origin missing
        pos: snapshot.pos || snapshot.origin || { x: 0, z: 0 }, // Fallback if pos missing
        velocity: snapshot.dir || { x: 0, z: 0 }, // Fallback if dir missing
        travelTime: snapshot.startedAt ? (Date.now() - snapshot.startedAt) : 0 // Calculate time elapsed since projectile started
      };
      
      // Safety check for empty/invalid properties
      if (!projectileData.castId || !projectileData.skillId) {
        console.error(`[ProjectileStore.add] Invalid projectile data: missing castId or skillId`, projectileData);
        return s; // Return unchanged state
      }
      
      // Additional validation for coordinate properties
      if (
        !projectileData.pos || 
        typeof projectileData.pos.x !== 'number' || 
        typeof projectileData.pos.z !== 'number'
      ) {
        console.error(`[ProjectileStore.add] Invalid position data for projectile ${projectileData.castId}`, projectileData.pos);
        // Try to fix it with a default position rather than failing
        projectileData.pos = { x: 0, z: 0 };
      }
      
      return { 
        live: { ...s.live, [snapshot.castId]: projectileData } 
      };
    } catch (error) {
      console.error(`[ProjectileStore.add] Error creating projectile data:`, error);
      return s; // Return unchanged state on error
    }
  }),
  
  markProjectileAsHit: (castId) => set((s) => {
    const projectile = s.live[castId];
    if (!projectile) return s;
    
    console.log(`[ProjectileStore.markProjectileAsHit] Marking projectile as hit: ${castId}`);
    
    // Mark with hit timestamp
    const hitProjectile = { 
      ...projectile, 
      hitTs: performance.now() 
    };
    
    // Remove from live and add to toRecycle
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [castId]: _, ...restLive } = s.live;
    
    return { 
      live: restLive,
      toRecycle: { ...s.toRecycle, [castId]: hitProjectile }
    };
  }),
  
  cleanup: () => set((s) => {
    // Implement cleanup logic if necessary
    return s;
  }),
  
  recycleProjectiles: () => set((s) => {
    // Recycle projectiles that are expired
    const newLive = { ...s.live };
    const newToRecycle = { ...s.toRecycle };
    
    for (const [castId, projectile] of Object.entries(s.toRecycle)) {
      if (projectile.expired) {
        console.log(`[ProjectileStore.recycleProjectiles] Recycling expired projectile: ${castId}`);
        delete newToRecycle[castId];
      }
    }
    
    return {
      live: newLive,
      toRecycle: newToRecycle
    };
  }),
  
  clearRecycled: (castId: string) => set((s) => {
    if (!s.toRecycle[castId]) {
      return s;
    }
    
    console.log(`[ProjectileStore.clearRecycled] Clearing recycled projectile: ${castId}`);
    
    // Remove from toRecycle
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [castId]: _, ...rest } = s.toRecycle;
    
    return { 
      toRecycle: rest
    };
  }),
  
  getProjectileByProjId: (projId) => {
    const state = get();
    // Search in live projectiles
    for (const projectile of Object.values(state.live)) {
      if (projectile.castId === projId) {
        return projectile;
      }
    }
    
    // Not found
    return undefined;
  }
}));
