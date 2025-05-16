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
  serverEpochLaunchTs: number; // NEW: To store server's Date.now() at projectile launch
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
    
    // Check if this castId already exists in live projectiles
    if (s.live[snapshot.castId]) {
      
      // Return the existing state with the projectile that's already in it
      return s;
    }
    
    const travelTime = Date.now() - snapshot.startedAt;
    if (travelTime < 0 || travelTime > 10000) {
      console.warn(`[ProjectileStore.add] Invalid travel time  ${snapshot}, travelTime: ${travelTime}`);
      return s; // Return unchanged state
    }
      // Create a ProjectileData object from the CastSnapshot
      const projectileData: ProjectileData = {
        type: 'CastSnapshot',
        castId: snapshot.castId,
        skillId: snapshot.skillId,
        casterId: snapshot.casterId,
        origin: snapshot.origin,
        pos: snapshot.pos,
        velocity: snapshot.dir,
        serverEpochLaunchTs: snapshot.startedAt, // Use the server's authoritative launch timestamp
        travelTime: travelTime, 
      };
      
      return { 
        live: { ...s.live, [snapshot.castId]: projectileData } 
      };

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
