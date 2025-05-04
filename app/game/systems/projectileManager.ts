import { create } from 'zustand';
import { ProjSpawn2, ProjHit2 } from '../../../shared/messages';

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
  castId?: string; // For the enhanced system
}

// Enhanced projectile live state
export interface ProjectileLive {
  projId: string;
  startPos: {x: number; z: number};
  dirXZ: {x: number; z: number};
  speed: number;
  launchTs: number;
  hitRadius?: number;
  casterId?: string;
  skillId: string;
  state: 'active' | 'hit';
  fadeOutStartTs?: number;
  opacity: number;
}

interface ProjectileStore {
  projectiles: Record<string, ProjectileState>;
  enhanced: Record<string, ProjectileLive>; // New map for enhanced projectiles
  updateOpacity: () => void;
  
  // New methods for the enhanced system
  addEnhancedProjectile: (data: ProjSpawn2) => void;
  handleEnhancedHit: (data: ProjHit2) => void;
}

// Duration of fade-out effect in milliseconds
const FADE_OUT_DURATION_MS = 500; // Increased from 300ms to 500ms for smoother fade-out

export const useProjectileStore = create<ProjectileStore>((set, get) => ({
  projectiles: {},
  enhanced: {}, // Initialize the enhanced projectiles map
  
  updateOpacity: () => {
    const now = Date.now();
    
    set(state => {
      const updatedProjectiles: Record<string, ProjectileState> = {};
      const updatedEnhanced: Record<string, ProjectileLive> = {};
      let hasChanges = false;
      let enhancedChanges = false;
      
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
      
      // Process each enhanced projectile
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
      return (hasChanges || enhancedChanges) ? { 
        projectiles: updatedProjectiles,
        enhanced: updatedEnhanced
      } : state;
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
          opacity: 1.0
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
}));  // Export the function directly
export function initProjectileListeners() {
  // Legacy event listeners removed
  
  // New enhanced event listeners - using custom events to match existing pattern
  window.addEventListener('projspawn2', (event: any) => {
    useProjectileStore.getState().addEnhancedProjectile(event.detail);
  });
  
  window.addEventListener('projhit2', (event: any) => {
    useProjectileStore.getState().handleEnhancedHit(event.detail);
  });
  
  // Set up opacity updates using requestAnimationFrame for smoother animations
  let animationFrameId: number;
  
  function updateLoop() {
    useProjectileStore.getState().updateOpacity();
    animationFrameId = requestAnimationFrame(updateLoop);
  }
  
  // Start the animation loop
  animationFrameId = requestAnimationFrame(updateLoop);
  
  // Return a cleanup function that can be used if needed
  return () => {
    cancelAnimationFrame(animationFrameId);
  };
}
