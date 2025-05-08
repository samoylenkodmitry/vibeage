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
  
  add: (p) => set((s) => ({ 
    live: { ...s.live, [p.castId]: p } 
  })),
  
  hit: (h) => set((s) => { 
    // Get the projectile that was hit
    const projectile = s.live[h.castId];
    if (!projectile) return s; // No-op if projectile not found
    
    // Mark with hit timestamp and move to toRecycle
    const hitProjectile = { 
      ...projectile, 
      hitTs: performance.now() 
    };
    
    // Remove from live and add to toRecycle
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [h.castId]: _, ...restLive } = s.live;
    
    return { 
      live: restLive,
      toRecycle: { ...s.toRecycle, [h.castId]: hitProjectile }
    }; 
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
