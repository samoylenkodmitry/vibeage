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
import { skillEventsBus, initializeSkillEventHandling } from '../systems/skillEventsHandler';

interface SkillEffect {
  id: string;
  skillId: string;
  startPosition: Vector3;
  targetPosition: Vector3;
  targetId: string;
  createdAtTs: number;
}

declare global {
  interface Window {
    castFireball?: () => void;
    castIceBolt?: () => void;
    castWater?: () => void;
    castPetrify?: () => void;
  }
}

export default function ActiveSkills() {
  const player = useGameStore(state => state.player);
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const castingSkill = useGameStore(state => state.castingSkill);
  const castingProgressMs = useGameStore(state => state.castingProgressMs);
  const skillCooldownEndTs = useGameStore(state => state.skillCooldownEndTs);
  // Remove the reference to the non-existent applySkillEffect function
  // const applySkillEffect = useGameStore(state => state.applySkillEffect);
  
  const [activeEffects, setActiveEffects] = useState<SkillEffect[]>([]);
  const [lastCastingSkill, setLastCastingSkill] = useState<string | null>(null);
  const [completedCasts, setCompletedCasts] = useState<string[]>([]);
  
  // Monitor skill casting
  // Add keyboard event handlers
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
        useGameStore.getState().castSkill(skillId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTargetId]);

  useEffect(() => {
    // If a skill has completed casting (was casting and now isn't)
    if (lastCastingSkill && !castingSkill) {
      const targetEnemy = enemies.find(e => e.id === selectedTargetId);
      
      // If we have a valid target and the skill is valid
      if (targetEnemy && lastCastingSkill && SKILLS[lastCastingSkill]) {
        const castId = `${lastCastingSkill}-${Date.now()}`;
        
        // Record this as a completed cast
        setCompletedCasts(prev => [...prev, castId]);
      }
    }
    
    setLastCastingSkill(castingSkill);
  }, [castingSkill, lastCastingSkill, enemies, selectedTargetId]);
  
  // Listen for skill effects from the server
  useEffect(() => {
    // Subscribe to skillEffect events from the socket
    const handleSkillEffect = (data: any) => {
      const { skillId, sourceId, targetId } = data;
      console.log('Skill effect received:', { skillId, sourceId, targetId });
      
      // Get the source player and target enemy
      const state = useGameStore.getState();
      const player = state.players[sourceId];
      const targetEnemy = state.enemies[targetId];
      
      if (player && targetEnemy && skillId) {
        // Create a new skill effect
        const newEffect: SkillEffect = {
          id: `effect-${Math.random().toString(36).substr(2, 9)}`,
          skillId,
          startPosition: new Vector3(
            player.position.x,
            player.position.y + 1.5, // Cast from shoulder height
            player.position.z
          ),
          targetPosition: new Vector3(
            targetEnemy.position.x,
            targetEnemy.position.y + 1.0, // Target center mass
            targetEnemy.position.z
          ),
          targetId,
          createdAtTs: Date.now()
        };
        
        // If this is the local player, use an event to get the accurate client position
        if (sourceId === useGameStore.getState().myPlayerId) {
          // Dispatch an event to request accurate client position
          window.dispatchEvent(new CustomEvent('requestPlayerPosition', {
            detail: {
              effectId: newEffect.id,
              callback: (clientPosition: {x: number, y: number, z: number}) => {
                console.log('Using client position for skill effect:', clientPosition);
                newEffect.startPosition = new Vector3(
                  clientPosition.x,
                  clientPosition.y + 1.5, // Cast from shoulder height
                  clientPosition.z
                );
                // Add the visual effect with corrected position
                setActiveEffects(prev => [...prev, newEffect]);
              }
            }
          }));
          // Return early as we'll add the effect in the callback
          return;
        }
        
        console.log('Creating skill effect with positions:', {
          start: {...newEffect.startPosition},
          target: {...newEffect.targetPosition}
        });
        
        // Add the visual effect
        setActiveEffects(prev => [...prev, newEffect]);
      }
    };
    
    // Get the socket from game store
    const socket = useGameStore.getState().socket;
    if (socket) {
      socket.on('skillEffect', handleSkillEffect);
      
      return () => {
        socket.off('skillEffect', handleSkillEffect);
      };
    }
  }, []);
  
  // Handle skill buttons being clicked directly (for testing or instant cast)
  const handleDirectSkillCast = useCallback((skillId: string) => {
    const targetEnemy = enemies.find(e => e.id === selectedTargetId);
    if (!targetEnemy || !SKILLS[skillId]) return;
    
    // Create a new skill effect
    const newEffect: SkillEffect = {
      id: `effect-${Math.random().toString(36).substr(2, 9)}`,
      skillId,
      startPosition: new Vector3(
        player.position.x,
        player.position.y + 1.5,
        player.position.z
      ),
      targetPosition: new Vector3(
        targetEnemy.position.x,
        targetEnemy.position.y + 1.0,
        targetEnemy.position.z
      ),
      targetId: targetEnemy.id,
      createdAtTs: Date.now()
    };
    
    setActiveEffects(prev => [...prev, newEffect]);
  }, [enemies, player, selectedTargetId]);

  // Handle the visual effect reaching its target
  const handleEffectHit = (effectId: string, targetId: string, skillId: string) => {
    if (targetId) {
      const skill = SKILLS[skillId];
      if (skill) {
        console.log('Skill hit target:', {skillId, targetId});
        
        // Get the socket to send effect application to the server
        const socket = useGameStore.getState().socket;
        
        if (socket) {
          // For water splash, apply effects to all enemies in the area
          if (skillId === 'water') {
            const targetEnemy = enemies.find(e => e.id === targetId);
            if (targetEnemy) {
              // Get the area of effect radius from skill config
              const areaRange = skill.areaOfEffect || 5;
              
              // Find all enemies in the area of effect range
              const affectedEnemies = enemies.filter(enemy => {
                if (!enemy.isAlive) return false;
                
                const dx = enemy.position.x - targetEnemy.position.x;
                const dz = enemy.position.z - targetEnemy.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                return distance <= areaRange;
              });
              
              console.log(`Water splash hitting ${affectedEnemies.length} enemies in range ${areaRange}`);
              
              // Apply effects to all enemies in range through socket event
              affectedEnemies.forEach(enemy => {
                socket.emit('applyEffects', { 
                  targetId: enemy.id, 
                  effects: skill.effects,
                  skillId
                });
              });
            }
          } else {
            // For all other skills, just apply to the target through socket event
            socket.emit('applyEffects', { 
              targetId, 
              effects: skill.effects,
              skillId
            });
          }
        }
      }
    }
    
    // Remove the effect from active effects
    setActiveEffects(prev => prev.filter(e => e.id !== effectId));
  };
  
  // Render different effects based on skill type
  const renderEffect = (effect: SkillEffect) => {
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
        // For water splash, we should apply the effect directly at the target position
        // instead of as a projectile like fireball/icebolt
        return (
          <WaterSplash
            key={id}
            position={targetPosition}
            radius={SKILLS[skillId].areaOfEffect || 3} // Use the area of effect value from the skill
            onComplete={() => {
              // Apply the effect immediately and then clean up
              handleEffectHit(id, targetId, skillId);
            }}
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
      // Add cases for other skills as they are implemented
      default:
        return null;
    }
  };
  
  // For debugging
  useEffect(() => {
    window.castFireball = () => handleDirectSkillCast('fireball');
    window.castIceBolt = () => handleDirectSkillCast('icebolt');
    window.castWater = () => handleDirectSkillCast('water');
    window.castPetrify = () => handleDirectSkillCast('petrify');
    
    return () => {
      window.castFireball = undefined;
      window.castIceBolt = undefined;
      window.castWater = undefined;
      window.castPetrify = undefined;
    };
  }, [handleDirectSkillCast]);
  
  return (
    <group>
      {activeEffects.map(effect => renderEffect(effect))}
    </group>
  );
}