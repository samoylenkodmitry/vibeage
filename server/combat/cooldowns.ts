import type { SkillDef, SkillId } from '../../packages/content/skills.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { getSkillLevel, getSkillUpgradeModifiers } from '../../packages/sim/skillUpgrades.js';
import { attackSpeedCooldownFactor } from '../../packages/sim/combatMath.js';

export type PlayerResourceUpdate = {
  mana: number;
  skillCooldownEndTs: Record<string, number>;
};

function getSkillCooldownEnd(player: PlayerState, skillId: SkillId): number {
  return player.skillCooldownEndTs?.[skillId] ?? 0;
}

export function isSkillOnCooldown(player: PlayerState, skillId: SkillId, now: number): boolean {
  return now < getSkillCooldownEnd(player, skillId);
}

export function hasEnoughMana(player: PlayerState, skill: Pick<SkillDef, 'manaCost'> & { id?: SkillId }): boolean {
  // Mana check accounts for the caster's skill upgrades: a leveled
  // Slash with manaCostMultiplier 0.75 only needs 3 mp instead of 4.
  const baseCost = skill.manaCost ?? 0;
  if (!skill.id) return player.mana >= baseCost;
  const mods = getSkillUpgradeModifiers(skill.id as SkillId, getSkillLevel(player.skillLevels, skill.id as SkillId));
  return player.mana >= baseCost * mods.manaCostMultiplier;
}

export function applySkillCostAndCooldown(
  player: PlayerState,
  skillId: SkillId,
  skill: Pick<SkillDef, 'manaCost' | 'cooldownMs' | 'autoRepeat'>,
  now: number,
): PlayerResourceUpdate {
  // Drive mana cost + cooldown through the upgrade modifiers so a
  // leveled-up skill actually costs less / refreshes faster. Engine-
  // wide: this is the single read site so adding new modifier kinds
  // doesn't require touching the cast handler.
  const mods = getSkillUpgradeModifiers(skillId, getSkillLevel(player.skillLevels, skillId));
  const manaCost = (skill.manaCost ?? 0) * mods.manaCostMultiplier;
  // §45.3 follow-up — spec passives like Aegis (Divine Shield) /
  // Shadow Step (Vanish) shorten specific skills' cooldowns.
  // Multiplies on top of the skill-upgrade modifier so a leveled
  // Vanish with Shadow Step gets BOTH reductions.
  const specCooldownMult = specCooldownMultiplierFor(player, skillId);
  // attackSpeed shortens the auto-attack interval (autoRepeat skills:
  // Basic Attack, Arrow Shot). Other skills keep their fixed cooldown.
  const attackSpeedMult = skill.autoRepeat ? attackSpeedCooldownFactor(player.stats?.attackSpeed) : 1;
  const cooldownMs = (skill.cooldownMs ?? 0) * mods.cooldownMultiplier * specCooldownMult * attackSpeedMult;
  player.mana = Math.max(0, player.mana - manaCost);
  player.skillCooldownEndTs = {
    ...(player.skillCooldownEndTs ?? {}),
    [skillId]: now + cooldownMs,
  };

  return buildPlayerResourceUpdate(player);
}

function buildPlayerResourceUpdate(player: PlayerState): PlayerResourceUpdate {
  return {
    mana: player.mana,
    skillCooldownEndTs: player.skillCooldownEndTs,
  };
}

/**
 * §45.3 follow-up — collapse spec + proficiency
 * `cooldownMultiplierBySkill` entries for the given skill into
 * one multiplier. Multiplies across both tiers when active, so
 * stacking specs that touch the same skill compound correctly.
 * Returns 1 when no spec is chosen, no entry for the skill, or
 * the player hasn't reached the relevant tier yet.
 */
function specCooldownMultiplierFor(player: PlayerState, skillId: SkillId): number {
  if (!player.specializationId) return 1;
  const spec = getSpecializationById(player.specializationId);
  if (!spec) return 1;
  let mul = spec.specializationPassive.modifiers.cooldownMultiplierBySkill?.[skillId] ?? 1;
  if (player.level >= PROFICIENCY_LEVEL) {
    mul *= spec.proficiencyPassive.modifiers.cooldownMultiplierBySkill?.[skillId] ?? 1;
  }
  return mul;
}
