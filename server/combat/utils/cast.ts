import { PlayerState, Enemy } from '../../../shared/types.js';
import { VecXZ } from '../../../shared/messages.js';
import { SKILLS, SkillId } from '../../../shared/skillsDefinition.js';

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
  
  console.log(`canCast check for ${skillId}: player=${caster?.id || 'unknown'}, target=${target?.id || 'none'}, targetPos=${JSON.stringify(targetPos || 'none')}`);
  
  // Validate skill exists
  if (!skillDef) {
    console.log(`Cast failed: Skill ${skillId} not found in definitions`);
    return { canCast: false, reason: 'invalid' };
  }
  
  // Check if caster is alive
  if (!caster.isAlive) {
    console.log(`Cast failed: Caster is not alive`);
    return { canCast: false, reason: 'invalid' };
  }
  
  // Check mana cost
  if (skillDef.manaCost && caster.mana < skillDef.manaCost) {
    console.log(`Cast failed: Not enough mana (have ${caster.mana}, need ${skillDef.manaCost})`);
    return { canCast: false, reason: 'nomana' };
  }
  
  // Check if skill is on cooldown
  const cooldownEnd = caster.skillCooldownEndTs?.[skillId] || 0;
  if (timestamp < cooldownEnd) {
    console.log(`Cast failed: Skill on cooldown until ${new Date(cooldownEnd).toISOString()}`);
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
  
  // All checks passed
  console.log(`Cast check passed for skill ${skillId}`);
  return { canCast: true };
}

/**
 * Apply mana cost and cooldown for a skill cast
 * Returns the updated player object
 */
export function applyCastCost(player: PlayerState, skillId: SkillId): PlayerState {
  const skill = SKILLS[skillId];
  if (!skill) return player;
  
  const now = Date.now();
  const updatedPlayer = { ...player };
  
  // Apply mana cost
  if (skill.manaCost) {
    updatedPlayer.mana = Math.max(0, player.mana - skill.manaCost);
  }
  
  // Apply cooldown
  if (skill.cooldownMs) {
    const cooldownEndTime = now + skill.cooldownMs;
    updatedPlayer.skillCooldownEndTs = {
      ...(updatedPlayer.skillCooldownEndTs || {}),
      [skillId]: cooldownEndTime
    };
  }
  
  return updatedPlayer;
}
