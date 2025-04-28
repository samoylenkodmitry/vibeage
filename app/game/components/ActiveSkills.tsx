'use client';

import { useEffect, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../systems/gameStore';
import { FireballProjectile } from '../skills/Fireball';
import { IceBoltProjectile } from '../skills/IceBolt';
import { WaterSplash } from '../skills/WaterSplash';
import { PetrifyProjectile } from '../skills/Petrify';
import { SKILLS } from '../models/Skill';
import ProjectileVfx from '../vfx/ProjectileVfx';
import SplashVfx, { spawnSplashVfx, spawnStunFlash } from '../vfx/SplashVfx';
import { ProjSpawn, ProjHit, InstantHit } from '../../../shared/messages';

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

declare global {
  interface WindowEventMap {
    'skillTriggered': CustomEvent<SkillTriggeredEvent>;
    'requestPlayerPosition': CustomEvent<{
      effectId: string;
      callback: (position: { x: number; y: number; z: number }) => void;
    }>;
    'projSpawn': CustomEvent<ProjSpawn>;
    'projHit': CustomEvent<ProjHit>;
    'projEnd': CustomEvent<{ id: string }>;
    'instantHit': CustomEvent<InstantHit>;
    'spawnSplash': CustomEvent<{ position: any; radius: number }>;
    'spawnStunFlash': CustomEvent<{ position: any }>;
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
  const [projs, setProjs] = useState<Record<string, ProjSpawn>>({});
  const [splashes, setSplashes] = useState<{id: string, position: any, radius: number}[]>([]);
  const [stunFlashes, setStunFlashes] = useState<{id: string, position: any}[]>([]);
  
  // Monitor key presses for skill casting
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedTargetId) return; // No target selected
      
      const keyToSkill: Record<string, string> = {
        '1': 'fireball',
        'q': 'fireball',
        '2': 'icebolt',
        'e': 'icebolt',
        '3': 'waterSplash',
        'r': 'waterSplash',
        '4': 'petrify',
        'f': 'petrify'
      };
      
      const skillId = keyToSkill[event.key.toLowerCase()];
      if (skillId && SKILLS[skillId]) {
        console.log('Casting skill via keyboard:', skillId);
        useGameStore.getState().sendCastReq(skillId, selectedTargetId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTargetId]);
  
  // Listen for projectile events
  useEffect(() => {
    const spawn = (e: CustomEvent<ProjSpawn>) => {
      console.log('Projectile spawn:', e.detail);
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
    
    window.addEventListener('projSpawn', spawn as EventListener);
    window.addEventListener('projEnd', end as EventListener);
    window.addEventListener('spawnSplash', spawnSplash as EventListener);
    window.addEventListener('spawnStunFlash', spawnFlash as EventListener);
    
    return () => {
      window.removeEventListener('projSpawn', spawn as EventListener);
      window.removeEventListener('projEnd', end as EventListener);
      window.removeEventListener('spawnSplash', spawnSplash as EventListener);
      window.removeEventListener('spawnStunFlash', spawnFlash as EventListener);
    };
  }, []);
  
  // Listen for hit events to spawn visual effects
  useEffect(() => {
    const hit = (e: CustomEvent<InstantHit|ProjHit>) => {
      const detail = e.detail as any;
      console.log('Hit event:', detail);
      
      if (detail.skillId === 'waterSplash') {
        spawnSplashVfx(detail.pos || detail.targetPos, 3);
      }
      if (detail.skillId === 'petrify') {
        spawnStunFlash(detail.pos || detail.targetPos);
      }
    };
    
    window.addEventListener('instantHit', hit as EventListener);
    window.addEventListener('projHit', hit as EventListener);
    
    return () => {
      window.removeEventListener('instantHit', hit as EventListener);
      window.removeEventListener('projHit', hit as EventListener);
    };
  }, []);
  
  // For debugging - expose global methods to manually trigger skills
  useEffect(() => {
    const castSkill = (skillId: string) => {
      if (!selectedTargetId) {
        console.warn('Cannot cast skill: No target selected');
        return;
      }
      useGameStore.getState().sendCastReq(skillId, selectedTargetId);
    };
    
    window.castFireball = () => castSkill('fireball');
    window.castIceBolt = () => castSkill('icebolt');
    window.castWater = () => castSkill('waterSplash'); // Changed from 'water' to 'waterSplash'
    window.castPetrify = () => castSkill('petrify');
    
    return () => {
      window.castFireball = undefined;
      window.castIceBolt = undefined;
      window.castWater = undefined;
      window.castPetrify = undefined;
    };
  }, [selectedTargetId]);
  
  return (
    <group>
      {Object.values(projs).map(p =>
        <ProjectileVfx 
          key={p.id} 
          id={p.id} 
          origin={p.origin} 
          dir={p.dir} 
          speed={p.speed}
        />
      )}
      {splashes.map(splash => 
        <SplashVfx 
          key={splash.id} 
          position={splash.position} 
          radius={splash.radius} 
        />
      )}
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
    </group>
  );
}