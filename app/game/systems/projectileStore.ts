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
      
      // Keep using the same object reference to avoid creating a duplicate visual
      return s;
    }
    
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
      origin: snapshot.origin,
      pos: snapshot.pos || snapshot.origin, // Use origin if pos is not provided
      velocity: snapshot.dir, // Direction vector can be used as velocity
      travelTime: snapshot.startedAt ? (Date.now() - snapshot.startedAt) : 0 // Calculate time elapsed since projectile started
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
