import { useEffect, useState, useCallback, useMemo } from 'react';
import { Group } from 'three';
import FireballProjectile from '../vfx/FireballProjectile';
import IceBoltVfx from '../vfx/IceBoltVfx';
import WaterProjectile from '../vfx/WaterProjectile';
import ProjectileVfx from '../vfx/ProjectileVfx';
import SplashVfx from '../vfx/SplashVfx';
import { PetrifyFlash } from '../vfx/PetrifyFlash';
import HealingVfx from '../vfx/HealingVfx';
import { InstantHit } from '../../../shared/messages';
import { useProjectileStore, ProjectileData } from '../systems/projectileStore';
import { get as poolGet, recycle, registerPool } from '../systems/vfxPool';
import { useGameStore } from '../systems/gameStore';

// Types for VFX instances
interface BaseVfxInstance {
  id: string;
  type: string;
  createdAt: number;
  expiresAt?: number;
}

interface ProjectileVfxInstance extends BaseVfxInstance {
  type: 'projectile';
  skillId: string;
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  speed: number;
  launchTs: number;
}

interface SplashVfxInstance extends BaseVfxInstance {
  type: 'splash';
  position: { x: number; y: number; z: number };
  radius: number;
}

interface FlashVfxInstance extends BaseVfxInstance {
  type: 'flash';
  flashType: 'stun' | 'petrify';
  position: { x: number; y: number; z: number };
}

interface HealingVfxInstance extends BaseVfxInstance {
  type: 'healing';
  position: { x: number; y: number; z: number };
  amount: number;
}

type VfxInstance = ProjectileVfxInstance | SplashVfxInstance | FlashVfxInstance | HealingVfxInstance;

export default function VfxManager() {
  // Store all active VFX instances
  const [vfxInstances, setVfxInstances] = useState<VfxInstance[]>([]);
  
  // Get projectiles from the store directly
  const liveProjectiles = useProjectileStore(state => state.live);
  const recycleProjectiles = useProjectileStore(state => state.toRecycle);
  const clearRecycled = useProjectileStore(state => state.clearRecycled);
  
  // Cache the projectiles array with useMemo to prevent unnecessary re-renders
  const projectileArray = useMemo(() => {
    const projArray = Object.values(liveProjectiles);
    console.log('[VfxManager] Rendering projectileArray:', projArray.map(p => ({ 
      castId: p.castId, 
      skillId: p.skillId 
    })));
    
    // Add specific logging for fireball
    const fireballs = projArray.filter(p => p.skillId === 'fireball');
    if (fireballs.length > 0) {
      console.log(`[VfxManager] Fireballs in projectileArray (${fireballs.length}):`, fireballs.map(f => ({ 
        castId: f.castId, 
        origin: f.origin, 
        velocity: f.velocity, 
        travelTime: f.travelTime 
      })));
    } else if (projArray.some(p => p.skillId === 'fireball')) {
      console.log('[VfxManager] Fireball detected but not logged in detail.');
    }
    
    // Check for duplicate castIds which would cause multiple projectiles
    const castIds = projArray.map(p => p.castId);
    const duplicates = castIds.filter((id, index) => castIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      console.warn('[VfxManager] Duplicate projectile castIds detected:', duplicates);
    }
    
    return projArray;
  }, [liveProjectiles]);
  
  // Track active pooled projectiles
  const [pooledInstances, setPooledInstances] = useState<Map<string, Group>>(new Map());
  
  // Initialize pools
  useEffect(() => {
    // Register pools for each projectile type
    registerPool('fireball', () => {
      const group = new Group();
      return group;
    });
    
    registerPool('iceBolt', () => {
      const group = new Group();
      return group;
    });
    
    registerPool('waterSplash', () => {
      const group = new Group();
      return group;
    });
    
    registerPool('default', () => {
      const group = new Group();
      return group;
    });
    
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Handle instant hit events
  const handleInstantHit = useCallback((e: CustomEvent<InstantHit>) => {
    console.log('VfxManager: Instant hit', e.detail);
    
    if (e.detail.skillId && e.detail.targetPos) {
      const position = e.detail.targetPos;
      
      // Generate effects based on skill type
      switch (e.detail.skillId) {
        case 'petrify':
          createFlashEffect(position, 'petrify');
          break;
      }
    }
  }, []);
  
  // Create a splash effect
  const createSplashEffect = useCallback((position: any, radius: number) => {
    const id = `splash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newSplash: SplashVfxInstance = {
      id,
      type: 'splash',
      position,
      radius,
      createdAt: performance.now(),
      expiresAt: performance.now() + 1000, // 1s duration for splashes
    };
    
    setVfxInstances(prev => [...prev, newSplash]);
  }, []);
  
  // Handle custom splash spawn events
  const handleSpawnSplash = useCallback((e: CustomEvent<{position: any, radius: number}>) => {
    createSplashEffect(e.detail.position, e.detail.radius);
  }, []);
  
  // Create a flash effect (stun or petrify)
  const createFlashEffect = useCallback((position: any, flashType: 'stun' | 'petrify') => {
    const id = `${flashType}-flash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newFlash: FlashVfxInstance = {
      id,
      type: 'flash',
      flashType,
      position,
      createdAt: performance.now(),
      expiresAt: performance.now() + 500, // 0.5s duration for flashes
    };
    
    setVfxInstances(prev => [...prev, newFlash]);
  }, []);
  
  // Handle stun flash events
  const handleSpawnStunFlash = useCallback((e: CustomEvent<{position: any}>) => {
    createFlashEffect(e.detail.position, 'stun');
  }, [createFlashEffect]);
  
  // Handle petrify flash events
  const handleSpawnPetrifyFlash = useCallback((e: CustomEvent<{position: any}>) => {
    createFlashEffect(e.detail.position, 'petrify');
  }, [createFlashEffect]);
  
  // Handle heal events
  const handleHeal = useCallback((e: CustomEvent<{position?: any, amount?: number}>) => {
    console.log('VfxManager: Heal event', e.detail);
    
    // Get player position if not provided in the event
    const myPlayerId = useGameStore.getState().myPlayerId;
    const player = myPlayerId ? useGameStore.getState().players[myPlayerId] : null;
    
    let healPosition;
    if (e.detail.position) {
      healPosition = e.detail.position;
    } else if (player) {
      healPosition = {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
      };
    } else {
      console.warn('Could not determine position for healing effect');
      return;
    }
    
    // Create a healing VFX instance
    const id = `healing-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newHealing: HealingVfxInstance = {
      id,
      type: 'healing',
      position: healPosition,
      amount: e.detail.amount || 20,
      createdAt: performance.now(),
      expiresAt: performance.now() + 1500 // 1.5s duration for healing effects
    };
    
    setVfxInstances(prev => [...prev, newHealing]);
  }, []);
  
  // Register and unregister event listeners
  useEffect(() => {
    // Register event listeners for non-projectile events
    window.addEventListener('instanthit', handleInstantHit as EventListener);
    window.addEventListener('spawnSplash', handleSpawnSplash as EventListener);
    window.addEventListener('spawnStunFlash', handleSpawnStunFlash as EventListener);
    window.addEventListener('petrifyFlash', handleSpawnPetrifyFlash as EventListener);
    window.addEventListener('heal', handleHeal as EventListener);
    
    // Use a set to track projectiles already processed in this cycle
    const processedProjectiles = new Set<string>();
    
    // Cleanup expired effects periodically with reduced frequency
    const cleanupInterval = setInterval(() => {
      const now = performance.now();
      
      // Filter out expired and projectile effects (projectiles now come from the store)
      setVfxInstances(prev => prev.filter(vfx => 
        (vfx.type !== 'projectile') && (!vfx.expiresAt || vfx.expiresAt > now)
      ));
      
      // Process projectiles that need to be recycled
      const projectilesToProcess = Object.entries(recycleProjectiles);
      
      if (projectilesToProcess.length > 0) {
        // Process in a batch to avoid multiple state updates
        const instancesToRemove: string[] = [];
        
        projectilesToProcess.forEach(([castId, projectile]) => {
          // Skip if already processed in this cycle
          if (processedProjectiles.has(castId)) return;
          processedProjectiles.add(castId);
          
          if (pooledInstances.has(castId)) {
            const type = projectile.skillId || 'default';
            const instance = pooledInstances.get(castId);
            
            if (instance) {
              console.log(`[VfxManager] Recycling projectile with castId: ${castId}`);
              // Make sure the instance is invisible before recycling
              instance.visible = false;
              // Recycle the projectile
              recycle(type, instance);
              // Track for removal
              instancesToRemove.push(castId);
            }
          }
          
          // Clear from store regardless
          clearRecycled(castId);
        });
        
        // Update the pooled instances in a single batch if needed
        if (instancesToRemove.length > 0) {
          setPooledInstances(prev => {
            const newMap = new Map(prev);
            instancesToRemove.forEach(id => newMap.delete(id));
            return newMap;
          });
        }
      }
      
      // Clear the processed set after each cycle
      processedProjectiles.clear();
    }, 250); // Increased from 100ms to 250ms for better performance
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('instanthit', handleInstantHit as EventListener);
      window.removeEventListener('spawnSplash', handleSpawnSplash as EventListener);
      window.removeEventListener('spawnStunFlash', handleSpawnStunFlash as EventListener);
      window.removeEventListener('petrifyFlash', handleSpawnPetrifyFlash as EventListener);
      window.removeEventListener('heal', handleHeal as EventListener);
      clearInterval(cleanupInterval);
    };
  }, [
    handleInstantHit, 
    handleSpawnSplash, 
    handleSpawnStunFlash, 
    handleSpawnPetrifyFlash,
    handleHeal,
    recycleProjectiles,
    pooledInstances,
    clearRecycled
  ]);
  
  // Render all active VFX instances
  return (
    <>
      {/* Render projectiles from the store */}
      {projectileArray.map((proj: ProjectileData) => {
        // For each projectile in the store, create the appropriate VFX
        const skillId = proj.skillId || 'default';
        const origin = { 
          x: proj.origin.x, 
          y: 1.5, // Default y position
          z: proj.origin.z 
        };
        const dir = { 
          x: proj.velocity.x, 
          y: 0, // No vertical movement
          z: proj.velocity.z 
        };
        
        // Get or create a pooled group for this projectile
        let group: Group;
        if (!pooledInstances.has(proj.castId)) {
          // Only create a new pooled instance if one doesn't already exist
          console.log(`[VfxManager] Creating new pooled group for projectile ${proj.castId}`);
          group = poolGet(skillId);
          
          // Add to active instances
          setPooledInstances(prev => {
            const newMap = new Map(prev);
            newMap.set(proj.castId, group);
            return newMap;
          });
        } else {
          group = pooledInstances.get(proj.castId)!;
          console.log(`[VfxManager] Reusing existing pooled group for projectile ${proj.castId}`);
        }
        
        // Explicitly ensure the group is visible
        group.visible = true;
        
        // Render appropriate projectile with pooled group
        const handleDone = () => {
          if (pooledInstances.has(proj.castId)) {
            console.log(`[VfxManager] handleDone called for projectile ${proj.castId}`);
            const skillType = skillId || 'default';
            const pooledGroup = pooledInstances.get(proj.castId)!;
            
            // Make sure it's invisible before recycling
            pooledGroup.visible = false;
            recycle(skillType, pooledGroup);
            
            // Instead of immediately updating state, mark this projectile for cleanup
            // in the next cleanup cycle to avoid potential re-render loops
            if (!recycleProjectiles[proj.castId]) {
              clearRecycled(proj.castId);
            }
          }
        };
        
        switch (skillId) {
          case 'fireball':
            console.log(`[VfxManager] Rendering FireballProjectile : ${JSON.stringify(proj)}, pooled group ID: ${group.uuid}, visible: ${group.visible}, dir: ${dir.x}, ${dir.z}`);
            return (
              <FireballProjectile
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                pos={proj.pos}
                pooled={group}
                onDone={handleDone}
              />
            );
          case 'iceBolt':
            return (
              <IceBoltVfx
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={Math.hypot(dir.x, dir.z) * 2 || 10} // Multiply speed for better visibility
                launchTs={proj.serverEpochLaunchTs} // Use server's epoch launch time
                pooled={group}
                onDone={handleDone}
              />
            );
          case 'waterSplash':
            return (
              <WaterProjectile
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={Math.hypot(dir.x, dir.z) * 2 || 10} // Multiply speed for better visibility
                launchTs={proj.serverEpochLaunchTs} // Use server's epoch launch time
                pooled={group}
                onDone={handleDone}
              />
            );
          default:
            return (
              <ProjectileVfx
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={Math.hypot(dir.x, dir.z) * 2 || 10} // Multiply speed for better visibility
                launchTs={proj.serverEpochLaunchTs} // Use server's epoch launch time
                pooled={group}
                onDone={handleDone}
              />
            );
        }
      })}
      
      {/* Render other VFX instances */}
      {vfxInstances.map(vfx => {
        if (vfx.type === 'splash') {
          return (
            <SplashVfx
              key={vfx.id}
              position={vfx.position}
              radius={vfx.radius}
            />
          );
        } else if (vfx.type === 'flash') {
          if (vfx.flashType === 'petrify') {
            return (
              <PetrifyFlash
                key={vfx.id}
                position={vfx.position}
              />
            );
          } else {
            // Stun flash would go here if it were a separate component
            return (
              <SplashVfx
                key={vfx.id}
                position={vfx.position}
                radius={0.8}
              />
            );
          }
        } else if (vfx.type === 'healing') {
          return (
            <HealingVfx
              key={vfx.id}
              position={vfx.position}
              amount={vfx.amount}
            />
          );
        }
        
        return null;
      })}
    </>
  );
}
