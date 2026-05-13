import { PlayerState, Enemy } from '../../../shared/types.js';
import { VecXZ } from '../../../packages/protocol/messages.js';
import { SKILLS, SkillId } from '../../../packages/content/skills.js';
import { applySkillCostAndCooldown, hasEnoughMana, isSkillOnCooldown } from '../cooldowns.js';

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
 * Returns detailed cast validation result
 */
export function canCast(
  caster: PlayerState,
  skill: { id: SkillId, range: number },
  target?: Enemy | null,
  targetPos?: VecXZ,
  timestamp: number = Date.now()
): { canCast: boolean; reason?: 'cooldown' | 'nomana' | 'invalid' | 'outofrange' } {
  const skillId = skill.id;
  const skillDef = SKILLS[skillId];

  // Validate skill exists
  if (!skillDef) {
    return { canCast: false, reason: 'invalid' };
  }
  
  // Check if caster is alive
  if (!caster.isAlive) {
    return { canCast: false, reason: 'invalid' };
  }
  
  // Check mana cost
  if (!hasEnoughMana(caster, skillDef)) {
    return { canCast: false, reason: 'nomana' };
  }
  
  // Check if skill is on cooldown
  if (isSkillOnCooldown(caster, skillId, timestamp)) {
    return { canCast: false, reason: 'cooldown' };
  }
  
  // Validate targeting requirements
  if (skillDef.requiresTarget && !target) {
    return { canCast: false, reason: 'invalid' };
  }
  
  // Check target range if a target position is provided
  if (targetPos && skill.range) {
    const dist = distance(
      { x: caster.position.x, z: caster.position.z },
      targetPos
    );
    
    if (dist > skill.range) {
      return { canCast: false, reason: 'outofrange' };
    }
  }
  
  // Check target range if a target is provided
  if (target && skill.range) {
    const dist = distance(
      { x: caster.position.x, z: caster.position.z },
      { x: target.position.x, z: target.position.z }
    );
    
    if (dist > skill.range) {
      return { canCast: false, reason: 'outofrange' };
    }
  }
  
  return { canCast: true };
}

/**
 * Apply mana cost and cooldown for a skill cast
 * Returns the updated player object
 */
export function applyCastCost(player: PlayerState, skillId: SkillId): PlayerState {
  const skill = SKILLS[skillId];
  if (!skill) return player;
  
  const updatedPlayer = {
    ...player,
    skillCooldownEndTs: { ...(player.skillCooldownEndTs ?? {}) },
  };

  applySkillCostAndCooldown(updatedPlayer, skillId, skill, Date.now());
  return updatedPlayer;
}
