'use client';

import { useEffect, useState, useCallback, JSX } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../systems/gameStore';
import { WaterSplash } from '../skills/WaterSplash';
import { PetrifyProjectile } from '../skills/Petrify';
import { SKILLS } from '../models/Skill';
import ProjectileVfx from '../vfx/ProjectileVfx';
import WaterProjectile from '../vfx/WaterProjectile';
import FireballProjectile from '../vfx/FireballProjectile';
import IceBoltProjectile from '../vfx/IceBoltProjectile';
import IceBoltVfx from '../vfx/IceBoltVfx';
import { PetrifyFlash } from '../vfx/PetrifyFlash';
import SplashVfx, { spawnSplashVfx, spawnStunFlash } from '../vfx/SplashVfx';
import { ProjSpawn2, ProjHit2, InstantHit } from '../../../shared/messages';
import { tryStartCast } from '../systems/castController';
import { SkillId } from '../../../shared/skillsDefinition';

// Type definitions
interface SkillEffect {
  id: string;
  skillId: string;
  startPosition: Vector3;
  targetPosition: Vector3;
  targetId: string;
  createdAtTs: number;
}

interface SkillTriggeredEvent {
  id: string;
  skillId: string;
  sourceId: string;
  targetId: string;
  startPosition: { x: number; y: number; z: number };
  targetPosition: { x: number; y: number; z: number };
  createdAtTs: number;
}

// Define interfaces for our component props
interface ProjectileProps {
  id: string;
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  speed: number;
}

declare global {
  interface WindowEventMap {
    'skillTriggered': CustomEvent<SkillTriggeredEvent>;
    'requestPlayerPosition': CustomEvent<{
      effectId: string;
      callback: (position: { x: number; y: number; z: number }) => void;
    }>;
    // Legacy events removed
    'instanthit': CustomEvent<InstantHit>;
    'spawnSplash': CustomEvent<{ position: any; radius: number }>;
    'spawnStunFlash': CustomEvent<{ position: any }>;
    
    // New enhanced events
    'projspawn2': CustomEvent<ProjSpawn2>;
    'projhit2': CustomEvent<ProjHit2>;
  }
  
  interface Window {
    castFireball?: () => void;
    castIceBolt?: () => void;
    castWater?: () => void;
    castPetrify?: () => void;
  }
}

export default function ActiveSkills() {
  // Use a more stable selection from the store
  const myPlayerId = useGameStore(state => state.myPlayerId);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const socket = useGameStore(state => state.socket);
  
  // New state for projectiles
  const [projs, setProjs] = useState<Record<string, ProjSpawn2>>({});
  const [splashes, setSplashes] = useState<{id: string, position: any, radius: number}[]>([]);
  const [stunFlashes, setStunFlashes] = useState<{id: string, position: any}[]>([]);
  const [petrifyFlashes, setPetrifyFlashes] = useState<{id: string, position: any}[]>([]);
  
  // Listen for projectile events
  useEffect(() => {
    const spawn = (e: CustomEvent<ProjSpawn2>) => {
      console.log('Projectile spawn:', e.detail);
      
      // Ensure the projectile has an ID
      if (!e.detail.id) {
        e.detail.id = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }
      
      setProjs(p => ({...p, [e.detail.id]: e.detail}));
    };
    
    const end = (e: CustomEvent<{id: string}>) => {
      console.log('Projectile end:', e.detail);
      setProjs(p => {
        const q = {...p};
        delete q[e.detail.id];
        return q;
      });
    };
    
    const spawnSplash = (e: CustomEvent<{position: any, radius: number}>) => {
      const id = `splash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setSplashes(s => [...s, { id, position: e.detail.position, radius: e.detail.radius }]);
      
      // Auto-remove splash after animation time
      setTimeout(() => {
        setSplashes(s => s.filter(splash => splash.id !== id));
      }, 1000);
    };
    
    const spawnFlash = (e: CustomEvent<{position: any}>) => {
      const id = `flash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setStunFlashes(s => [...s, { id, position: e.detail.position }]);
      
      // Auto-remove flash after animation time
      setTimeout(() => {
        setStunFlashes(s => s.filter(flash => flash.id !== id));
      }, 500);
    };
    
    const spawnPetrifyFlash = (e: CustomEvent<{position: any}>) => {
      const id = `petrify-flash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setPetrifyFlashes(s => [...s, { id, position: e.detail.position }]);
      
      // Auto-remove flash after animation time
      setTimeout(() => {
        setPetrifyFlashes(s => s.filter(flash => flash.id !== id));
      }, 500);
    };
    
    const hit = (e: CustomEvent<any>) => {
      console.log('Hit event:', e.detail);
      
      // Remove the projectile from state
      if ('id' in e.detail) {
        setProjs(p => {
          const q = {...p};
          delete q[e.detail.id];
          return q;
        });
      }
      
      // Handle hit effects for specific skills
      if ('skillId' in e.detail) {
        let position;
        if ('impactPos' in e.detail) {
          position = { x: e.detail.impactPos.x, y: 1.5, z: e.detail.impactPos.z }; // ProjHit2
        } else if ('targetPos' in e.detail) {
          position = e.detail.targetPos; // InstantHit
        }
        
        if (position) {
          // Create different effects based on skill type
          switch (e.detail.skillId) {
            case 'waterSplash':
              // Create a water splash effect
              window.dispatchEvent(new CustomEvent('spawnSplash', {
                detail: {
                  position: new Vector3(position.x, position.y, position.z),
                  radius: 2
                }
              }));
              break;
              
            case 'fireball':
              // Create a fire explosion effect
              window.dispatchEvent(new CustomEvent('spawnSplash', {
                detail: {
                  position: new Vector3(position.x, position.y, position.z),
                  radius: 1.5
                }
              }));
              break;
              
            case 'icebolt':
              // Create an ice shatter effect
              window.dispatchEvent(new CustomEvent('spawnSplash', {
                detail: {
                  position: new Vector3(position.x, position.y, position.z),
                  radius: 1
                }
              }));
              break;
              
            case 'petrify':
              // Create a stun flash effect
              window.dispatchEvent(new CustomEvent('spawnStunFlash', {
                detail: {
                  position: new Vector3(position.x, position.y, position.z)
                }
              }));
              break;
          }
        }
      }
    };
    
    window.addEventListener('projspawn2', spawn as EventListener);
    window.addEventListener('projhit2', hit as EventListener);
    window.addEventListener('instanthit', hit as EventListener);
    window.addEventListener('spawnSplash', spawnSplash as EventListener);
    window.addEventListener('spawnStunFlash', spawnFlash as EventListener);
    window.addEventListener('petrifyFlash', spawnPetrifyFlash as EventListener);
    
    return () => {
      window.removeEventListener('projspawn2', spawn as EventListener);
      window.removeEventListener('projhit2', hit as EventListener);
      window.removeEventListener('instanthit', hit as EventListener);
      window.removeEventListener('spawnSplash', spawnSplash as EventListener);
      window.removeEventListener('spawnStunFlash', spawnFlash as EventListener);
      window.removeEventListener('petrifyFlash', spawnPetrifyFlash as EventListener);
    };
  }, []);
  
  // For debugging - expose global methods to manually trigger skills
  useEffect(() => {
    const castSkill = (skillId: SkillId) => {
      // Use the imported tryStartCast function
      tryStartCast(skillId, selectedTargetId || undefined);
    };
    
    window.castFireball = () => castSkill('fireball' as SkillId);
    window.castIceBolt = () => castSkill('icebolt' as SkillId);
    window.castWater = () => castSkill('waterSplash' as SkillId); // Changed from 'water' to 'waterSplash'
    window.castPetrify = () => castSkill('petrify' as SkillId);
    
    return () => {
      window.castFireball = undefined;
      window.castIceBolt = undefined;
      window.castWater = undefined;
      window.castPetrify = undefined;
    };
  }, [selectedTargetId]);
  
  // VFX registry for skill components
  const vfxTable: Record<string, (props: ProjectileProps) => JSX.Element> = {
    fireball: FireballProjectile,
    icebolt: IceBoltVfx,
    waterSplash: WaterProjectile,
    petrify: ProjectileVfx, // Using generic projectile for now
    // Add more skills as they are implemented
  };
  
  // Render projectiles, splashes, and stun flashes
  return (
    <group>
      {/* Render all active projectiles */}
      {Object.values(projs).map((p) => {
        // Skip rendering if required props are missing
        if (!p.id) {
          console.warn('Skipping projectile with undefined id');
          return null;
        }
        
        console.log('Rendering projectile:', p.id, 'skillId:', p.skillId);
        
        // Convert skillId to a safe string key for the vfxTable
        const skillIdKey = p.skillId?.toString() || '';
        
        // Convert 2D vectors to 3D vectors with y=0 for this specific projectile
        const origin3D = {
          x: p.origin.x, 
          y: 0, // Default height for projectiles
          z: p.origin.z
        };
        
        const dir3D = {
          x: p.dir.x,
          y: 0, // No vertical component
          z: p.dir.z
        };
        
        // Use the VFX component from our registry
        const VfxComponent = vfxTable[skillIdKey];
        
        if (VfxComponent) {
          return (
            <VfxComponent 
              key={p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`} 
              id={p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`} 
              origin={origin3D} 
              dir={dir3D} 
              speed={p.speed}
            />
          );
        }
        
        // Fallback to default if not found in registry
        return (
          <ProjectileVfx 
            key={p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`} 
            id={p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`} 
            origin={origin3D} 
            dir={dir3D} 
            speed={p.speed}
          />
        );
      })}
      
      {/* Render splash effects */}
      {splashes.map(splash => (
        <SplashVfx 
          key={splash.id} 
          position={splash.position} 
          radius={splash.radius} 
        />
      ))}
      
      {/* Keep existing stun flash for petrify - replace with custom VFX later */}
      {stunFlashes.map(flash => (
        <mesh 
          key={flash.id} 
          position={[flash.position.x, flash.position.y + 1.5, flash.position.z]}
        >
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshBasicMaterial color={'yellow'} transparent={true} opacity={0.8} />
        </mesh>
      ))}
      
      {/* Render petrify flash effects */}
      {petrifyFlashes.map(flash => (
        <PetrifyFlash 
          key={flash.id} 
          pos={flash.position} 
        />
      ))}
    </group>
  );
}