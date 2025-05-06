import { create } from 'zustand';
import { ProjSpawn2, ProjHit2 } from '../../../shared/messages';

// Enhanced projectile live state
export interface ProjectileLive {
  projId: string;
  startPos: {x: number; y: number; z: number};
  dirXZ: {x: number; z: number};
  speed: number;
  launchTs: number;
  hitRadius?: number;
  casterId?: string;
  skillId: string;
  state: 'active' | 'hit';
  fadeOutStartTs?: number;
  opacity: number;
  travelMs?: number; // Travel time in milliseconds for accurate client-side animation
}

interface ProjectileStore {
  enhanced: Record<string, ProjectileLive>; // Map for projectiles
  updateOpacity: () => void;
  
  // Methods for the projectile system
  addEnhancedProjectile: (data: ProjSpawn2) => void;
  handleEnhancedHit: (data: ProjHit2) => void;
}

// Duration of fade-out effect in milliseconds
const FADE_OUT_DURATION_MS = 500; // 500ms for smooth fade-out

export const useProjectileStoreLegacy = create<ProjectileStore>((set, get) => ({
  enhanced: {}, // Initialize the projectiles map
  
  updateOpacity: () => {
    const now = Date.now();
    
    set(state => {
      const updatedEnhanced: Record<string, ProjectileLive> = {};
      let enhancedChanges = false;
      
      // Process each projectile
      Object.values(state.enhanced).forEach(proj => {
        if (proj.fadeOutStartTs) {
          const elapsedFadeTime = now - proj.fadeOutStartTs;
          
          // If fade complete, don't include in updated list (remove it)
          if (elapsedFadeTime >= FADE_OUT_DURATION_MS) {
            enhancedChanges = true;
            return;
          }
          
          // Calculate new opacity
          const newOpacity = Math.max(0, 1 - (elapsedFadeTime / FADE_OUT_DURATION_MS));
          
          // Only update if opacity changed significantly
          if (Math.abs(newOpacity - proj.opacity) > 0.01) {
            enhancedChanges = true;
            updatedEnhanced[proj.projId] = {
              ...proj,
              opacity: newOpacity
            };
          } else {
            updatedEnhanced[proj.projId] = proj;
          }
        } else {
          // Keep active projectiles
          updatedEnhanced[proj.projId] = proj;
        }
      });
      
      // Only update state if changes occurred
      return enhancedChanges ? { enhanced: updatedEnhanced } : state;
    });
  },
  
  addEnhancedProjectile: (data: ProjSpawn2) => {
    set(state => ({
      enhanced: {
        ...state.enhanced,
        [data.castId]: {
          projId: data.castId,
          startPos: data.origin,
          dirXZ: data.dir,
          speed: data.speed,
          launchTs: data.launchTs,
          hitRadius: data.hitRadius,
          casterId: data.casterId || 'unknown', // Handle potential undefined casterId
          skillId: data.skillId || 'unknown',  // Handle potential undefined skillId
          state: 'active',
          opacity: 1.0,
          travelMs: data.travelMs // Store the server-provided travel time
        }
      }
    }));
  },
  
  handleEnhancedHit: (data: ProjHit2) => {
    // Mark the projectile as hit and start fade-out
    set(state => {
      const projectile = state.enhanced[data.castId];
      if (!projectile) return state;
      
      return {
        enhanced: {
          ...state.enhanced,
          [data.castId]: {
            ...projectile,
            state: 'hit',
            fadeOutStartTs: Date.now(),
          }
        }
      };
    });
  },
}));

export function initProjectileListeners() {
  // Set up opacity updates using requestAnimationFrame for smoother animations
  let animationFrameId: number;
  
  function updateLoop() {
    useProjectileStoreLegacy.getState().updateOpacity();
    animationFrameId = requestAnimationFrame(updateLoop);
  }
  
  // Start the animation loop
  animationFrameId = requestAnimationFrame(updateLoop);
  
  // Return a cleanup function that can be used if needed
  return () => {
    cancelAnimationFrame(animationFrameId);
  };
}

// Re-export the new projectile store to transition callers
export { useProjectileStore } from './projectileStore';
