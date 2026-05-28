import { SKILLS, type SkillDef, type SkillEffect, type SkillId, type SkillUpgradeModifiers } from '../content/skills.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../content/specializations.js';

const IDENTITY: Required<SkillUpgradeModifiers> = {
  dmgMultiplier: 1,
  cooldownMultiplier: 1,
  rangeBonus: 0,
  areaBonus: 0,
  manaCostMultiplier: 1,
  durationMultiplier: 1,
};

/**
 * Fold every active upgrade tier for a skill into a single modifier
 * block. Tiers stack multiplicatively for the *Multiplier fields and
 * additively for rangeBonus / areaBonus. Returns the identity element when no
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
    if (m.areaBonus !== undefined) accumulated.areaBonus += m.areaBonus;
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

export type SkillRangeContext = {
  skillLevels?: Record<string, number> | null;
  specializationId?: string | null;
  level?: number;
};

export function getEffectiveSkillRange(skillId: SkillId, context: SkillRangeContext = {}): number | undefined {
  const skill = SKILLS[skillId] as SkillDef | undefined;
  if (!skill || skill.range === undefined) return undefined;
  const mods = getSkillUpgradeModifiers(skillId, getSkillLevel(context.skillLevels ?? undefined, skillId));
  return (skill.range + mods.rangeBonus) * skillRangeMultiplierFor(skillId, context);
}

function skillRangeMultiplierFor(skillId: SkillId, context: SkillRangeContext): number {
  if (!context.specializationId) return 1;
  const spec = getSpecializationById(context.specializationId);
  if (!spec) return 1;
  let mul = spec.specializationPassive.modifiers.rangeMultiplierBySkill?.[skillId] ?? 1;
  if ((context.level ?? 1) >= PROFICIENCY_LEVEL) {
    mul *= spec.proficiencyPassive.modifiers.rangeMultiplierBySkill?.[skillId] ?? 1;
  }
  return mul;
}

/**
 * Render-time helper for tooltips / panels: apply the cumulative
 * upgrade modifiers to a skill's headline numbers (dmg, manaCost,
 * cooldownMs, range, effect durations). The engine already does the
 * same math at cast time via getSkillUpgradeModifiers — this helper
 * just exposes the same numbers for the UI so a leveled-up skill's
 * tooltip matches what the server actually applies.
 */
export interface EffectiveSkillStats {
  dmg?: number;
  manaCost: number;
  cooldownMs: number;
  range?: number;
  area?: number;
  effectDurationsMs: number[];
  /**
   * Per-effect value after the upgrade multiplier. damage / heal /
   * shield / dot-flavour effects scale with dmgMultiplier (mirroring
   * the engine's resolveCastImpact + applyHealEffect paths); non-
   * numeric effects (bless, slow, taunt — value is a percentage or
   * marker) are passed through untouched.
   */
  effectValues: number[];
}

const SCALED_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'damage', 'heal', 'shield', 'burn', 'poison', 'dot',
]);

export function scaleSkillEffectForUpgrade(
  effect: SkillEffect,
  mods: Required<SkillUpgradeModifiers>,
): SkillEffect {
  const scalesValue = SCALED_EFFECT_TYPES.has(effect.type);
  return {
    ...effect,
    value: scalesValue ? effect.value * mods.dmgMultiplier : effect.value,
    durationMs: effect.durationMs !== undefined
      ? Math.round(effect.durationMs * mods.durationMultiplier)
      : undefined,
  };
}

export function getEffectiveSkillStats(
  skillId: SkillId,
  skillLevel: number,
  context: SkillRangeContext = {},
): EffectiveSkillStats {
  const skill = SKILLS[skillId] as SkillDef | undefined;
  const mods = getSkillUpgradeModifiers(skillId, skillLevel);
  if (!skill) {
    return { manaCost: 0, cooldownMs: 0, effectDurationsMs: [], effectValues: [] };
  }
  return {
    dmg: skill.dmg !== undefined ? Math.round(skill.dmg * mods.dmgMultiplier) : undefined,
    manaCost: Math.round((skill.manaCost ?? 0) * mods.manaCostMultiplier),
    cooldownMs: Math.round((skill.cooldownMs ?? 0) * mods.cooldownMultiplier),
    range: getEffectiveSkillRange(skillId, { ...context, skillLevels: { ...(context.skillLevels ?? {}), [skillId]: skillLevel } }),
    area: skill.area !== undefined ? skill.area + mods.areaBonus : undefined,
    effectDurationsMs: (skill.effects ?? []).map((e) => scaleSkillEffectForUpgrade(e, mods).durationMs ?? 0),
    effectValues: (skill.effects ?? []).map((e) => Math.round(scaleSkillEffectForUpgrade(e, mods).value ?? 0)),
  };
}
