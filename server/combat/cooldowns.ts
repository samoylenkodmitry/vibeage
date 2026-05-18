import type { SkillDef, SkillId } from '../../packages/content/skills.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { getSkillLevel, getSkillUpgradeModifiers } from '../../packages/sim/skillUpgrades.js';

export type PlayerResourceUpdate = {
  mana: number;
  skillCooldownEndTs: Record<string, number>;
};

export function getSkillCooldownEnd(player: PlayerState, skillId: SkillId): number {
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
  skill: Pick<SkillDef, 'manaCost' | 'cooldownMs'>,
  now: number,
): PlayerResourceUpdate {
  // Drive mana cost + cooldown through the upgrade modifiers so a
  // leveled-up skill actually costs less / refreshes faster. Engine-
  // wide: this is the single read site so adding new modifier kinds
  // doesn't require touching the cast handler.
  const mods = getSkillUpgradeModifiers(skillId, getSkillLevel(player.skillLevels, skillId));
  const manaCost = (skill.manaCost ?? 0) * mods.manaCostMultiplier;
  const cooldownMs = (skill.cooldownMs ?? 0) * mods.cooldownMultiplier;
  player.mana = Math.max(0, player.mana - manaCost);
  player.skillCooldownEndTs = {
    ...(player.skillCooldownEndTs ?? {}),
    [skillId]: now + cooldownMs,
  };

  return buildPlayerResourceUpdate(player);
}

export function buildPlayerResourceUpdate(player: PlayerState): PlayerResourceUpdate {
  return {
    mana: player.mana,
    skillCooldownEndTs: player.skillCooldownEndTs,
  };
}
