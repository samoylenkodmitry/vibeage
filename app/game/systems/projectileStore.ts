import { create } from 'zustand';
import { ProjSpawn2, ProjHit2 } from '../../../shared/messages';

// Extended projectile type with hit timestamp
export interface ProjectileData extends ProjSpawn2 {
  hitTs?: number;
  expired?: boolean;
}

type State = { 
  live: Record<string, ProjectileData>;
  // Keep hit projectiles around briefly for VFX cleanup
  toRecycle: Record<string, ProjectileData>;
};

type Actions = {
  add: (p: ProjSpawn2) => void;
  hit: (msg: ProjHit2) => void;
  markExpired: (castId: string) => void;
  clearRecycled: (castId: string) => void;
};

export const useProjectileStore = create<State & Actions>((set) => ({
  live: {},
  toRecycle: {},
  
  add: (p) => set((s) => { 
    console.log(`[ProjectileStore.add] Adding projectile with castId: ${p.castId}, skillId: ${p.skillId}`);
    
    // Special logging for fireball
    if (p.skillId === 'fireball') {
      console.log(`[ProjectileStore.add] Attempting to add Fireball: castId=${p.castId}. Current live count: ${Object.keys(s.live).length}`);
    }
    
    // Check if this castId already exists in live projectiles
    if (s.live[p.castId]) {
      console.warn(`[ProjectileStore.add] Projectile with castId: ${p.castId} already exists in live projectiles. This might cause duplicate visuals.`);
      
      // Special logging for fireball
      if (p.skillId === 'fireball') {
        console.warn(`[ProjectileStore.add] Fireball with castId: ${p.castId} already exists. Not re-adding.`);
      }
      
      // Keep using the same object reference to avoid creating a duplicate visual
      return s;
    }
    
    // Special logging for fireball
    if (p.skillId === 'fireball') {
      console.log(`[ProjectileStore.add] Successfully added Fireball: castId=${p.castId}. New live count: ${Object.keys(s.live).length + 1}`);
    }
    
    return { 
      live: { ...s.live, [p.castId]: p } 
    };
  }),
  
  hit: (h) => set((s) => { 
    console.log(`[ProjectileStore.hit] Received ProjHit2 for castId: ${h.castId}`, h);
    console.log('[ProjectileStore.hit] s.live before:', JSON.stringify(Object.keys(s.live)));
    
    // Get the projectile that was hit
    const projectile = s.live[h.castId];
    
    if (!projectile) {
      console.warn(`[ProjectileStore.hit] Projectile not found in s.live for castId: ${h.castId}`);
      // If projectile is not in live but is in toRecycle, this might be a duplicate hit message
      if (s.toRecycle[h.castId]) {
        console.warn(`[ProjectileStore.hit] Projectile found in s.toRecycle. Possible duplicate hit message.`);
      }
      return s; // No-op if projectile not found
    }
    
    console.log(`[ProjectileStore.hit] Found projectile for castId: ${h.castId}`, projectile);
    
    // Mark with hit timestamp and move to toRecycle
    const hitProjectile = { 
      ...projectile, 
      hitTs: performance.now() 
    };
    
    // Remove from live and add to toRecycle
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [h.castId]: _, ...restLive } = s.live;
    
    const newState = { 
      live: restLive,
      toRecycle: { ...s.toRecycle, [h.castId]: hitProjectile }
    };
    
    console.log('[ProjectileStore.hit] s.live after:', JSON.stringify(Object.keys(newState.live)));
    console.log('[ProjectileStore.hit] s.toRecycle after:', JSON.stringify(Object.keys(newState.toRecycle)));
    
    return newState; 
  }),
  
  markExpired: (castId) => set((s) => {
    const projectile = s.live[castId];
    if (!projectile) return s;
    
    // Mark as expired and move to toRecycle
    const expiredProjectile = {
      ...projectile,
      expired: true
    };
    
    // Remove from live and add to toRecycle
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [castId]: _, ...restLive } = s.live;
    
    return {
      live: restLive,
      toRecycle: { ...s.toRecycle, [castId]: expiredProjectile }
    };
  }),
  
  clearRecycled: (castId) => set((s) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [castId]: _, ...restRecycle } = s.toRecycle;
    return { toRecycle: restRecycle };
  })
}));
