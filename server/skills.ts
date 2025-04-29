import { Server } from 'socket.io';
import { Enemy, StatusEffect } from '../shared/types.js';
import { SkillType } from './types.js';
import { SKILLS, SkillId } from '../shared/skillsDefinition.js';
import { VecXZ } from '../shared/messages.js';
import { predictPosition } from './world.js';

interface PlayerState {
  id: string;
  socketId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  skills: SkillType[];
  skillCooldownEndTs: Record<string, number>;
  statusEffects: StatusEffect[];
  level: number;
  experience: number;
  experienceToNextLevel: number;
  castingSkill: SkillType | null;
  castingProgressMs: number;
  isAlive: boolean;
  movement?: any;
}

/**
 * Calculate distance between two points
 */
function distance(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Check if a skill can be cast
 * Uses prediction to ensure accurate position for range checks
 */
export function canCast(
  caster: PlayerState,
  skill: { id: string, range: number },
  target: Enemy | null,
  targetPos: VecXZ | null,
  now: number
): boolean {
  // Check if caster is alive
  if (!caster.isAlive) {
    return false;
  }
  
  // Check if skill is on cooldown
  const cooldownEnd = caster.skillCooldownEndTs[skill.id] || 0;
  if (now < cooldownEnd) {
    return false;
  }
  
  // Get skill definition
  const skillDef = SKILLS[skill.id as SkillType];
  if (!skillDef) {
    return false;
  }
  
  // Check mana cost
  if (caster.mana < skillDef.manaCost) {
    return false;
  }
  
  // If target-based skill, check target is valid
  if (target) {
    if (!target.isAlive) {
      return false;
    }
    
    // Predict caster position at current time
    const casterPos = predictPosition(caster, now);
    
    // Get target position
    const targetPos = { x: target.position.x, z: target.position.z };
    
    // Check range
    if (distance(casterPos, targetPos) > skill.range) {
      return false;
    }
  } 
  // If position-based skill, check position is within range
  else if (targetPos) {
    const casterPos = predictPosition(caster, now);
    
    // Check range
    if (distance(casterPos, targetPos) > skill.range) {
      return false;
    }
  } else {
    // No target or position specified
    return false;
  }
  
  return true;
}

/**
 * Execute a skill with all its effects
 */
export function executeSkill(
  caster: PlayerState,
  target: Enemy,
  skillId: SkillType,
  server: Server
): void {
  const now = Date.now();
  const skill = SKILLS[skillId];
  
  if (!skill) return;
  
  // Apply skill cost
  caster.mana -= skill.manaCost;
  caster.skillCooldownEndTs[skillId] = now + skill.cooldownMs;
  
  // Apply damage
  if (skill.dmg && target) {
    const oldHealth = target.health;
    target.health = Math.max(0, target.health - skill.dmg);
    
    if (target.health === 0) {
      target.isAlive = false;
      target.deathTimeTs = now;
      target.targetId = null;
      
      // Grant experience to the player
      caster.experience += target.experienceValue;
      
      // Check for level up
      while (caster.experience >= caster.experienceToNextLevel) {
        caster.level++;
        caster.experience -= caster.experienceToNextLevel;
        caster.experienceToNextLevel = Math.floor(caster.experienceToNextLevel * 1.5);
        caster.maxHealth += 20;
        caster.health = caster.maxHealth;
        caster.maxMana += 10;
        caster.mana = caster.maxMana;
      }
    }
  }
  
  // Apply status effect
  if (skill.status && target) {
    for (const status of skill.status) {
      const existingEffect = target.statusEffects.find(e => e.type === status.type);
      if (existingEffect) {
        existingEffect.value = status.value;
        existingEffect.durationMs = status.durationMs;
        existingEffect.startTimeTs = now;
      } else {
        const effectId = Math.random().toString(36).substr(2, 9);
        target.statusEffects.push({
          id: effectId,
          ...status,
          startTimeTs: now,
          sourceSkill: skillId,
        });
      }
    }
  }
  
  // Broadcast updates
  server.emit('enemyUpdated', target);
  server.emit('playerUpdated', caster);
}
