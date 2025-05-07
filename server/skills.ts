import { Server } from 'socket.io';
import { Enemy, StatusEffect } from '../shared/types.js';
import { SkillType } from './types.js';
import { SKILLS, SkillId } from '../shared/skillsDefinition.js';
import { VecXZ } from '../shared/messages.js';
import { predictPosition, awardPlayerXP } from './world.js';
import { hash } from '../shared/combatMath.js';
import { PlayerState } from '../shared/types.js';

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

    target.health = Math.max(0, target.health - skill.dmg);
    
    if (target.health === 0) {
      target.isAlive = false;
      target.deathTimeTs = now;
      target.targetId = null;
      
      // Grant experience to the player using the centralized function
      awardPlayerXP(caster, target.experienceValue, `killing enemy ${target.id} with ${skillId}`, server);
    }
  }
  
  // Apply status effect
  if (skill.effects && target) {
    for (const effect of skill.effects) {
      const existingEffect = target.statusEffects.find(e => e.type === effect.type);
      if (existingEffect) {
        existingEffect.value = effect.value;
        existingEffect.durationMs = effect.durationMs;
        existingEffect.startTimeTs = now;
      } else {
        // Generate a deterministic effect ID
        const effectId = `effect-${hash(`${effect.type}-${now}-${skillId}`)}`;
        target.statusEffects.push({
          id: effectId,
          type: effect.type,
          value: effect.value,
          durationMs: effect.durationMs,
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

/**
 * Spawn a projectile from a skill cast
 */
export function spawnProjectileFromSkill(
  world: any,  // World interface will be defined later
  caster: PlayerState,
  skillId: SkillId,
  targetPos?: VecXZ,
  targetId?: string
): void {
  const skill = SKILLS[skillId];
  
  // Check if skill exists and is a projectile type
  if (!skill || skill.cat !== 'projectile' || !skill.speed) {
    return;
  }
  
  // Get caster position
  const casterPos: VecXZ = { x: caster.position.x, z: caster.position.z };
  
  // Determine target position
  let finalTargetPos: VecXZ;
  
  if (targetPos) {
    // If target position provided, use it
    finalTargetPos = targetPos;
  } else if (targetId) {
    // If target ID provided, get entity position
    const targetEntity = world.getGameState().enemies[targetId] || world.getGameState().players[targetId];
    if (!targetEntity) return;
    
    finalTargetPos = { x: targetEntity.position.x, z: targetEntity.position.z };
  } else {
    // No valid target, use caster's forward direction
    const forwardDir = { x: 0, z: 1 }; // Assuming +Z is forward
    finalTargetPos = {
      x: casterPos.x + forwardDir.x * 10, // 10 units forward
      z: casterPos.z + forwardDir.z * 10
    };
  }
  
  // Calculate direction from caster to target
  const dx = finalTargetPos.x - casterPos.x;
  const dz = finalTargetPos.z - casterPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  // Normalize direction
  const dir: VecXZ = dist > 0 
    ? { x: dx / dist, z: dz / dist } 
    : { x: 0, z: 1 };  // Default forward
  
  // Spawn the projectile in the world
  world.spawnProjectile({
    casterId: caster.id,
    skillId,
    pos: casterPos,
    dir,
    speed: skill.speed,
    targetId
  });
}
