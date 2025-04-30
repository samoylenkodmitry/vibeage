import { create } from 'zustand';
import { ProjSpawn, ProjHit, ProjEnd } from '../../../shared/messages';

// Define interfaces for our state
export interface ProjectileState {
  id: string;
  skillId: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs: number;
  fadeOutStartTs?: number;
  opacity: number;
}

interface ProjectileStore {
  projectiles: Record<string, ProjectileState>;
  addProjectile: (data: ProjSpawn) => void;
  handleHit: (data: ProjHit) => void;
  handleEnd: (data: ProjEnd) => void;
  updateOpacity: () => void;
}

// Duration of fade-out effect in milliseconds
const FADE_OUT_DURATION_MS = 300;

export const useProjectileStore = create<ProjectileStore>((set, get) => ({
  projectiles: {},
  
  addProjectile: (data: ProjSpawn) => {
    set(state => ({
      projectiles: {
        ...state.projectiles,
        [data.id]: {
          id: data.id,
          skillId: data.skillId,
          origin: data.origin,
          dir: data.dir,
          speed: data.speed,
          launchTs: data.launchTs,
          opacity: 1.0
        }
      }
    }));
  },
  
  handleHit: (data: ProjHit) => {
    // We don't remove the projectile immediately on hit anymore
    // Instead, we'll wait for ProjEnd which will be sent by the server
  },
  
  handleEnd: (data: ProjEnd) => {
    // Mark the projectile for fade-out instead of removing immediately
    set(state => {
      const projectile = state.projectiles[data.id];
      if (!projectile) return state;
      
      return {
        projectiles: {
          ...state.projectiles,
          [data.id]: {
            ...projectile,
            fadeOutStartTs: Date.now(),
          }
        }
      };
    });
  },
  
  updateOpacity: () => {
    const now = Date.now();
    
    set(state => {
      const updatedProjectiles: Record<string, ProjectileState> = {};
      let hasChanges = false;
      
      // Process each projectile
      Object.values(state.projectiles).forEach(proj => {
        // If projectile is fading out
        if (proj.fadeOutStartTs) {
          const elapsedFadeTime = now - proj.fadeOutStartTs;
          
          // If fade complete, don't include in updated list (remove it)
          if (elapsedFadeTime >= FADE_OUT_DURATION_MS) {
            hasChanges = true;
            return;
          }
          
          // Calculate new opacity
          const newOpacity = Math.max(0, 1 - (elapsedFadeTime / FADE_OUT_DURATION_MS));
          
          // Only update if opacity changed significantly
          if (Math.abs(newOpacity - proj.opacity) > 0.01) {
            hasChanges = true;
            updatedProjectiles[proj.id] = {
              ...proj,
              opacity: newOpacity
            };
          } else {
            updatedProjectiles[proj.id] = proj;
          }
        } else {
          // Keep active projectiles
          updatedProjectiles[proj.id] = proj;
        }
      });
      
      // Only update state if changes occurred
      return hasChanges ? { projectiles: updatedProjectiles } : state;
    });
  }
}));

// Export the function directly
export function initProjectileListeners() {
  window.addEventListener('projspawn', (event: any) => {
    useProjectileStore.getState().addProjectile(event.detail);
  });
  
  window.addEventListener('projhit', (event: any) => {
    useProjectileStore.getState().handleHit(event.detail);
  });
  
  window.addEventListener('projend', (event: any) => {
    useProjectileStore.getState().handleEnd(event.detail);
  });
  
  // Set up periodic opacity updates
  setInterval(() => {
    useProjectileStore.getState().updateOpacity();
  }, 16); // Update at ~60fps
}
