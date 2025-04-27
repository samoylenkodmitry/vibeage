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
  const players = useGameStore(state => state.players);
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const socket = useGameStore(state => state.socket);
  
  // State for skill effects
  const [activeEffects, setActiveEffects] = useState<SkillEffect[]>([]);
  
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
  
  // Listen for skillTriggered events
  useEffect(() => {
    const handleSkillTriggered = (event: CustomEvent<SkillTriggeredEvent>) => {
      const detail = event.detail;
      console.log('Skill triggered event received:', detail);
      
      // Create a new skill effect
      const newEffect: SkillEffect = {
        id: detail.id,
        skillId: detail.skillId,
        startPosition: new Vector3(
          detail.startPosition.x,
          detail.startPosition.y + 1.5, // Cast from shoulder height
          detail.startPosition.z
        ),
        targetPosition: new Vector3(
          detail.targetPosition.x,
          detail.targetPosition.y + 1.0, // Target center mass
          detail.targetPosition.z
        ),
        targetId: detail.targetId,
        createdAtTs: detail.createdAtTs
      };
      
      // If this is the local player, get accurate client-side position
      if (detail.sourceId === myPlayerId) {
        window.dispatchEvent(new CustomEvent('requestPlayerPosition', {
          detail: {
            effectId: detail.id,
            callback: (clientPosition) => {
              console.log('Using client position for skill effect:', clientPosition);
              newEffect.startPosition = new Vector3(
                clientPosition.x,
                clientPosition.y + 1.5, // Cast from shoulder height
                clientPosition.z
              );
              // Add the effect with the corrected position
              setActiveEffects(prev => [...prev, newEffect]);
            }
          }
        }));
        return; // Return early as we'll add the effect in the callback
      }
      
      // Add the visual effect for other players
      setActiveEffects(prev => [...prev, newEffect]);
    };
    
    // Listen for server's skillEffect events
    const handleServerSkillEffect = (data: { skillId: string, sourceId: string, targetId: string }) => {
      console.log('Server skillEffect received:', data);
      
      const sourcePlayer = players[data.sourceId];
      const targetEnemy = enemies[data.targetId];
      
      if (sourcePlayer && targetEnemy) {
        // Trigger the same event handling as the custom event
        const triggeredEvent = new CustomEvent<SkillTriggeredEvent>('skillTriggered', {
          detail: {
            id: `effect-${Math.random().toString(36).substring(2, 9)}`,
            skillId: data.skillId,
            sourceId: data.sourceId,
            targetId: data.targetId,
            startPosition: sourcePlayer.position,
            targetPosition: targetEnemy.position,
            createdAtTs: Date.now()
          }
        });
        
        window.dispatchEvent(triggeredEvent);
      }
    };
    
    window.addEventListener('skillTriggered', handleSkillTriggered);
    
    if (socket) {
      socket.on('skillEffect', handleServerSkillEffect);
    }
    
    return () => {
      window.removeEventListener('skillTriggered', handleSkillTriggered);
      if (socket) {
        socket.off('skillEffect', handleServerSkillEffect);
      }
    };
  }, [myPlayerId, players, enemies, socket]);
  
  // Handle the visual effect reaching its target
  const handleEffectHit = useCallback((effectId: string, targetId: string, skillId: string) => {
    console.log('Skill hit target:', { skillId, targetId });
    
    // Remove the effect from active effects
    setActiveEffects(prev => prev.filter(e => e.id !== effectId));
  }, []);
  
  // Render different effects based on skill type
  const renderEffect = useCallback((effect: SkillEffect) => {
    const { id, skillId, startPosition, targetPosition, targetId } = effect;
    
    switch (skillId) {
      case 'fireball':
        return (
          <FireballProjectile 
            key={id}
            startPosition={startPosition}
            targetPosition={targetPosition}
            onHit={() => handleEffectHit(id, targetId, skillId)}
          />
        );
      case 'icebolt':
        return (
          <IceBoltProjectile
            key={id}
            startPosition={startPosition}
            targetPosition={targetPosition}
            onHit={() => handleEffectHit(id, targetId, skillId)}
          />
        );
      case 'water':
        return (
          <WaterSplash
            key={id}
            position={targetPosition}
            radius={SKILLS[skillId]?.areaOfEffect || 3}
            onComplete={() => handleEffectHit(id, targetId, skillId)}
          />
        );
      case 'petrify':
        return (
          <PetrifyProjectile
            key={id}
            startPosition={startPosition}
            targetPosition={targetPosition}
            onHit={() => handleEffectHit(id, targetId, skillId)}
          />
        );
      default:
        console.warn('Unknown skill type:', skillId);
        return null;
    }
  }, [handleEffectHit]);
  
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
    window.castWater = () => castSkill('water');
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
      {activeEffects.map(effect => renderEffect(effect))}
    </group>
  );
}