import { SKILLS, type SkillDef, type SkillId, type SkillUpgradeModifiers } from '../content/skills.js';

const IDENTITY: Required<SkillUpgradeModifiers> = {
  dmgMultiplier: 1,
  cooldownMultiplier: 1,
  rangeBonus: 0,
  manaCostMultiplier: 1,
  durationMultiplier: 1,
};

/**
 * Fold every active upgrade tier for a skill into a single modifier
 * block. Tiers stack multiplicatively for the *Multiplier fields and
 * additively for rangeBonus. Returns the identity element when no
 * upgrades are unlocked yet — callers can apply unconditionally.
 *
 * Engine reads `skillLevels[skillId]` (default 1) and folds entries
 * [0..level-2] (level 2 of the skill = first upgrade tier).
 */
export function getSkillUpgradeModifiers(
  skillId: SkillId,
  skillLevel: number,
): Required<SkillUpgradeModifiers> {
  const skill = SKILLS[skillId] as SkillDef | undefined;
  if (!skill?.upgrades?.length) return { ...IDENTITY };
  const accumulated = { ...IDENTITY };
  const tiers = Math.max(0, Math.min(skill.upgrades.length, skillLevel - 1));
  for (let i = 0; i < tiers; i += 1) {
    const m = skill.upgrades[i].modifiers ?? {};
    if (m.dmgMultiplier !== undefined) accumulated.dmgMultiplier *= m.dmgMultiplier;
    if (m.cooldownMultiplier !== undefined) accumulated.cooldownMultiplier *= m.cooldownMultiplier;
    if (m.rangeBonus !== undefined) accumulated.rangeBonus += m.rangeBonus;
    if (m.manaCostMultiplier !== undefined) accumulated.manaCostMultiplier *= m.manaCostMultiplier;
    if (m.durationMultiplier !== undefined) accumulated.durationMultiplier *= m.durationMultiplier;
  }
  return accumulated;
}

/**
 * Convenience: read player.skillLevels[skillId] safely (defaults 1).
 */
export function getSkillLevel(skillLevels: Record<string, number> | undefined, skillId: SkillId): number {
  return Math.max(1, Math.floor(skillLevels?.[skillId] ?? 1));
}
