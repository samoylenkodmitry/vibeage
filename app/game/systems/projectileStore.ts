import { create } from 'zustand';
import { CastState } from '../../../packages/protocol/messages';
import type { CastSnapshot } from '../../../shared/types';

export const PROJECTILE_RECYCLE_FADE_MS = 500;

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
  serverEpochLaunchTs: number;
  clientLaunchTs: number;
  hitTs?: number;
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

export function getProjectileOpacity(projectile: ProjectileData, now: number): number {
  if (!projectile.hitTs) {
    return 1;
  }

  const fadeProgress = (now - projectile.hitTs) / PROJECTILE_RECYCLE_FADE_MS;
  return Math.max(0, 1 - fadeProgress);
}

export const useProjectileStore = create<State & Actions>((set, get) => ({
  live: {},
  toRecycle: {},
  
  add: (snapshot) => set((s) => { 
    console.log(`[ProjectileStore.add] Processing castId: ${snapshot.castId}, skillId: ${snapshot.skillId}, newPos: (${snapshot.pos.x.toFixed(2)}, ${snapshot.pos.z.toFixed(2)}), state: ${snapshot.state}`);
    
    const travelTime = Date.now() - snapshot.startedAt;
    const clientNow = performance.now();
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
      serverEpochLaunchTs: snapshot.startedAt,
      clientLaunchTs: clientNow - travelTime,
      travelTime: travelTime, 
    };

    if (snapshot.state === CastState.Impact) {
      console.log(`[ProjectileStore.add] Projectile ${snapshot.castId} is in Impact state. Moving to toRecycle.`);
      const previousProjectile = s.live[snapshot.castId] ?? s.toRecycle[snapshot.castId] ?? projectileData;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [snapshot.castId]: _, ...restLive } = s.live;

      return {
        live: restLive,
        toRecycle: {
          ...s.toRecycle,
          [snapshot.castId]: {
            ...previousProjectile,
            pos: snapshot.pos,
            hitTs: performance.now(),
          },
        },
      };
    }
    
    // Create a new live object with the updated/added projectile.
    // This ensures that if s.live[castId] already exists, it's replaced with the new projectileData.
    const newLive = {
      ...s.live,
      [snapshot.castId]: projectileData,
    };

    return { 
      live: newLive
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
  
  recycleProjectiles: (now = performance.now()) => set((s) => {
    const newToRecycle: Record<string, ProjectileData> = {};
    let changed = false;
    
    for (const [castId, projectile] of Object.entries(s.toRecycle)) {
      if (projectile.hitTs && now - projectile.hitTs >= PROJECTILE_RECYCLE_FADE_MS) {
        console.log(`[ProjectileStore.recycleProjectiles] Recycling expired projectile: ${castId}`);
        changed = true;
      } else {
        newToRecycle[castId] = projectile;
      }
    }
    
    return changed ? { toRecycle: newToRecycle } : s;
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
