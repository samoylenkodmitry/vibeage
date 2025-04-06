'use client';

import { useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../systems/gameStore';
import { FireballProjectile } from '../skills/Fireball';
import { IceBoltProjectile } from '../skills/IceBolt';
import { WaterSplash } from '../skills/WaterSplash';
import { PetrifyProjectile } from '../skills/Petrify';
import { SKILLS } from '../models/Skill';

interface SkillEffect {
  id: string;
  skillId: string;
  startPosition: Vector3;
  targetPosition: Vector3;
  targetId: string;
  createdAt: number;
}

export default function ActiveSkills() {
  const player = useGameStore(state => state.player);
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const castingSkill = useGameStore(state => state.castingSkill);
  const castingProgress = useGameStore(state => state.castingProgress);
  const skillCooldowns = useGameStore(state => state.skillCooldowns);
  const applySkillEffect = useGameStore(state => state.applySkillEffect);
  
  const [activeEffects, setActiveEffects] = useState<SkillEffect[]>([]);
  const [lastCastingSkill, setLastCastingSkill] = useState<string | null>(null);
  const [completedCasts, setCompletedCasts] = useState<string[]>([]);
  
  // Monitor skill casting
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
  
  // Process completed casts to create visual effects
  useEffect(() => {
    if (completedCasts.length === 0) return;
    
    // Get the last completed cast
    const castId = completedCasts[0];
    const skillId = castId.split('-')[0];
    const targetEnemy = enemies.find(e => e.id === selectedTargetId);
    
    if (targetEnemy && skillId) {
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
        targetId: targetEnemy.id,
        createdAt: Date.now()
      };
      
      // Add the effect
      setActiveEffects(prev => [...prev, newEffect]);
      
      // Remove this completed cast
      setCompletedCasts(prev => prev.filter(id => id !== castId));
    }
  }, [completedCasts, enemies, selectedTargetId, player]);
  
  // Handle skill buttons being clicked directly (for testing or instant cast)
  const handleSkillCast = (skillId: string) => {
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
      createdAt: Date.now()
    };
    
    setActiveEffects(prev => [...prev, newEffect]);
  };
  
  // Handle the visual effect reaching its target
  const handleEffectHit = (effectId: string, targetId: string, skillId: string) => {
    // Apply the skill effect to the target
    if (targetId) {
      const skill = SKILLS[skillId];
      if (skill) {
        applySkillEffect(targetId, skill.effects);
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
    window.castFireball = () => handleSkillCast('fireball');
    window.castIceBolt = () => handleSkillCast('icebolt');
    window.castWater = () => handleSkillCast('water');
    window.castPetrify = () => handleSkillCast('petrify');
  }, []);
  
  return (
    <group>
      {activeEffects.map(effect => renderEffect(effect))}
    </group>
  );
}