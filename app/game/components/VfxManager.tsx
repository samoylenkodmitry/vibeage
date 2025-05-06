import { useEffect, useState, useCallback, useMemo } from 'react';
import { Vector3 } from 'three';
import FireballProjectile from '../vfx/FireballProjectile';
import IceBoltVfx from '../vfx/IceBoltVfx';
import WaterProjectile from '../vfx/WaterProjectile';
import ProjectileVfx from '../vfx/ProjectileVfx';
import SplashVfx from '../vfx/SplashVfx';
import { PetrifyFlash } from '../vfx/PetrifyFlash';
import { ProjSpawn2, ProjHit2, InstantHit } from '../../../shared/messages';
import { SkillId } from '../../../shared/skillsDefinition';
import { useProjectileStore } from '../systems/projectileStore';

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

type VfxInstance = ProjectileVfxInstance | SplashVfxInstance | FlashVfxInstance;

export default function VfxManager() {
  // Store all active VFX instances
  const [vfxInstances, setVfxInstances] = useState<VfxInstance[]>([]);
  
  // Get projectiles from the store directly
  const liveProjectiles = useProjectileStore(state => state.live);
  
  // Cache the projectiles array with useMemo to prevent unnecessary re-renders
  const projectileArray = useMemo(() => {
    return Object.values(liveProjectiles);
  }, [liveProjectiles]);
  
  // Mapping of skill IDs to VFX types
  const skillVfxMap = {
    fireball: 'fireball',
    iceBolt: 'icebolt',
    waterSplash: 'water',
    petrify: 'petrify',
  };
  
  // Handle projectile spawn events
  const handleProjectileSpawn = useCallback((e: CustomEvent<ProjSpawn2>) => {
    console.log('VfxManager: Projectile spawn', e.detail);
    
    // Debug validation of required properties
    if (!e.detail.dir || typeof e.detail.speed !== 'number' || e.detail.speed === 0) {
      console.error('VfxManager: Invalid projectile data', {
        dir: e.detail.dir,
        speed: e.detail.speed,
        skillId: e.detail.skillId || 'unknown'
      });
      return; // Exit early if invalid data
    }
    
    // Ensure the projectile has an ID
    const projId = e.detail.castId || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Ensure timestamps are valid - use current time if missing or invalid
    const now = performance.now();
    let launchTimestamp = e.detail.launchTs;
    
    // If timestamp is missing or invalid (too far in future or past), use current time
    if (!launchTimestamp || launchTimestamp > now + 5000 || launchTimestamp < now - 30000) {
      console.warn(`[VfxManager] Invalid launchTs: ${launchTimestamp}, using current time`);
      launchTimestamp = now;
    }
    
    // Create a new projectile instance with y-coordinate defaulting to 1.5
    const newProj: ProjectileVfxInstance = {
      id: projId,
      type: 'projectile',
      skillId: e.detail.skillId || 'unknown',
      origin: { 
        x: e.detail.origin.x, 
        y: 1.5, // Default y-position for projectiles
        z: e.detail.origin.z 
      },
      dir: { 
        x: e.detail.dir.x, 
        y: 0, // Default no vertical movement
        z: e.detail.dir.z 
      },
      speed: e.detail.speed,
      launchTs: launchTimestamp,
      createdAt: now,
    };
    
    console.log(`[VfxManager] Creating projectile ${projId}:`, {
      origin: `(${newProj.origin.x.toFixed(2)}, ${newProj.origin.y.toFixed(2)}, ${newProj.origin.z.toFixed(2)})`,
      dir: `(${newProj.dir.x.toFixed(2)}, ${newProj.dir.y.toFixed(2)}, ${newProj.dir.z.toFixed(2)})`,
      speed: newProj.speed,
      launchTs: newProj.launchTs,
      currentTime: now
    });
    
    setVfxInstances(prev => [...prev, newProj]);
  }, []);
  
  // Handle projectile hit events
  const handleProjectileHit = useCallback((hitData: ProjHit2) => {
    console.log('VfxManager: Projectile hit', hitData);
    
    // Create impact effects based on skill type
    if (hitData.skillId && hitData.impactPos) {
      const position = { 
        x: hitData.impactPos.x, 
        y: 1.5, // Default height for impact effects 
        z: hitData.impactPos.z 
      };
      
      // Generate the proper effect based on the skill type
      switch (hitData.skillId) {
        case 'fireball':
          createSplashEffect(position, 1.5);
          break;
        case 'waterSplash':
          createSplashEffect(position, 2);
          break;
        case 'iceBolt':
          createSplashEffect(position, 1);
          break;
        case 'petrify':
          createFlashEffect(position, 'petrify');
          break;
      }
    }
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
  
  // Register and unregister event listeners
  useEffect(() => {
    // Register event listeners for non-projectile events
    window.addEventListener('instanthit', handleInstantHit as EventListener);
    window.addEventListener('spawnSplash', handleSpawnSplash as EventListener);
    window.addEventListener('spawnStunFlash', handleSpawnStunFlash as EventListener);
    window.addEventListener('petrifyFlash', handleSpawnPetrifyFlash as EventListener);
    
    // Cleanup expired effects periodically
    const cleanupInterval = setInterval(() => {
      const now = performance.now();
      // Filter out expired and projectile effects (projectiles now come from the store)
      setVfxInstances(prev => prev.filter(vfx => 
        (vfx.type !== 'projectile') && (!vfx.expiresAt || vfx.expiresAt > now)
      ));
    }, 100);
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('instanthit', handleInstantHit as EventListener);
      window.removeEventListener('spawnSplash', handleSpawnSplash as EventListener);
      window.removeEventListener('spawnStunFlash', handleSpawnStunFlash as EventListener);
      window.removeEventListener('petrifyFlash', handleSpawnPetrifyFlash as EventListener);
      clearInterval(cleanupInterval);
    };
  }, [
    handleInstantHit, 
    handleSpawnSplash, 
    handleSpawnStunFlash, 
    handleSpawnPetrifyFlash
  ]);
  
  // Render all active VFX instances
  return (
    <>
      {/* Render projectiles from the store */}
      {projectileArray.map((proj: ProjSpawn2) => {
        // For each projectile in the store, create the appropriate VFX
        const skillId = proj.skillId || 'unknown';
        const origin = { 
          x: proj.origin.x, 
          y: proj.origin.y || 1.5, // Use server-provided y or default to 1.5
          z: proj.origin.z 
        };
        const dir = { 
          x: proj.dir.x, 
          y: 0, // No vertical movement
          z: proj.dir.z 
        };
        
        switch (skillId) {
          case 'fireball':
            return (
              <FireballProjectile
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={proj.speed}
                launchTs={proj.launchTs}
              />
            );
          case 'iceBolt':
            return (
              <IceBoltVfx
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={proj.speed}
                launchTs={proj.launchTs}
              />
            );
          case 'waterSplash':
            return (
              <WaterProjectile
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={proj.speed}
                launchTs={proj.launchTs}
              />
            );
          default:
            return (
              <ProjectileVfx
                key={proj.castId}
                id={proj.castId}
                origin={origin}
                dir={dir}
                speed={proj.speed}
                launchTs={proj.launchTs}
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
        }
        
        return null;
      })}
    </>
  );
}
