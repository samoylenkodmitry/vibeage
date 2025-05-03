// filepath: /home/s/develop/projects/vibe/1/shared/combatMath.ts
import { SkillId, SKILLS } from './skillsDefinition';

/**
 * Calculate the mana cost of a skill, accounting for potential changes from player stats
 * @param skillId The skill ID
 * @param playerLevel Current player level
 * @returns Mana cost for the skill
 */
export function getManaCost(skillId: SkillId, playerLevel: number): number {
  const skill = SKILLS[skillId];
  if (!skill) return 0;
  
  const baseCost = skill.manaCost;
  
  return baseCost;
}

/**
 * Calculate the cooldown of a skill, accounting for potential changes from player stats
 * @param skillId The skill ID
 * @param playerLevel Current player level
 * @returns Cooldown time in milliseconds
 */
export function getCooldownMs(skillId: SkillId, playerLevel: number): number {
  const skill = SKILLS[skillId];
  if (!skill) return 0;
  
  const baseCooldown = skill.cooldownMs;

  return baseCooldown;
}
