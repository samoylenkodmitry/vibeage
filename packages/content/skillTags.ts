/**
 * §49/M3 PR014 — descriptive skill tags.
 *
 * Most fields are derived from the existing `SkillDef` shape so a
 * new skill picks up sensible defaults automatically. Per-skill
 * overrides live in `SKILL_TAG_OVERRIDES` for cases where inference
 * would produce the wrong answer (e.g. petrify is `control`, not
 * `damage`, even though it has a small `dmg` value).
 *
 * The wiki / balance report consume the resolved tag set via
 * `getSkillTags`. The content-graph validator can later require
 * non-null tags on every active skill once authors have reviewed.
 *
 * Type aliases (SkillRole / School / ScalingStat / TargetMode /
 * PveUse) live here rather than skills.ts to keep that file under
 * the maintainability cap; skills.ts re-exports them.
 */
import { SKILLS, type SkillDef, type SkillId } from './skills.js';

/** Primary combat role this skill fills in a kit. */
export type SkillRole = 'damage' | 'heal' | 'tank' | 'control' | 'mobility' | 'utility' | 'passive';
/** Flavour bucket for visual/audio + future resistance system. */
export type SkillSchool =
  | 'fire' | 'water' | 'ice' | 'holy' | 'shadow' | 'physical' | 'nature' | 'arcane' | 'poison';
/** Which derived stat the skill primarily scales with. */
export type SkillScalingStat = 'str' | 'dex' | 'con' | 'int' | 'wit' | 'men' | 'pAtk' | 'mAtk' | 'hybrid';
/** Targeting shape — drives validation + tooltip "Target:" line. */
export type SkillTargetMode = 'self' | 'enemy' | 'ally' | 'ground' | 'direction' | 'area-self' | 'aura' | 'passive';
/** PvE situational use, for wiki filters + future ai/recommender. */
export type SkillPveUse = 'single-target' | 'pack' | 'boss' | 'escape' | 'opener' | 'finisher' | 'sustain';

export type ResolvedSkillTags = {
  role: SkillRole;
  school: SkillSchool;
  scalingStat: SkillScalingStat;
  targetMode: SkillTargetMode;
  pveUse: SkillPveUse[];
};

/**
 * §SKILL-ENGINE B9–B12 — per-skill offensive modifiers the cast
 * pipeline reads. All optional; absent = no effect. Defined here
 * (not skills.ts) to keep that file under the maintainability cap.
 */
export interface SkillOffense {
  /** Execute: damage ×(1 + executeBonus·(1 − targetHpFraction)). Full at 0 HP. */
  executeBonus?: number;
  /** Added to this cast's crit chance (0..1). */
  bonusCritChance?: number;
  /** Added to this cast's crit multiplier. */
  bonusCritMult?: number;
  /** Heal the caster for this fraction (0..1) of damage dealt. */
  lifestealPct?: number;
  /** Armor penetration — subtracts from the target's P.Def/M.Def before mitigation. */
  armorPen?: number;
}

/**
 * Per-skill overrides for cases where the derived defaults would be
 * wrong. Add an entry here when the author's intent doesn't match
 * the inference (e.g. CC skills with small token damage, hybrid
 * scaling, escapes that look like teleports, etc.).
 */
const SKILL_TAG_OVERRIDES: Partial<Record<SkillId, Partial<ResolvedSkillTags>>> = {
  // Petrify deals a token amount of damage but is fundamentally a CC.
  petrify: { role: 'control', pveUse: ['single-target', 'boss'] },
  // Taunt has no damage; it's tank-role aggro.
  taunt: { role: 'tank', school: 'physical', scalingStat: 'str', targetMode: 'enemy', pveUse: ['pack', 'single-target'] },
  // Escape: utility recall, no damage, no target.
  escape: { role: 'mobility', school: 'arcane', scalingStat: 'wit', targetMode: 'self', pveUse: ['escape'] },
  // Vanish: rogue stealth + aggroReset.
  vanish: { role: 'mobility', school: 'shadow', scalingStat: 'dex', targetMode: 'self', pveUse: ['escape'] },
  // Bless: party buff.
  bless: { role: 'utility', school: 'holy', scalingStat: 'int', targetMode: 'self', pveUse: ['sustain'] },
  // DivineShield: defensive shield buff.
  divineShield: { role: 'tank', school: 'holy', scalingStat: 'int', targetMode: 'self', pveUse: ['sustain'] },
  // Heals.
  holyLight: { role: 'heal', school: 'holy', scalingStat: 'int', targetMode: 'self', pveUse: ['sustain'] },
  // Dispel: cleanse.
  dispel: { role: 'utility', school: 'holy', scalingStat: 'int', targetMode: 'self', pveUse: ['sustain'] },
  // ShieldWall: tank shield aura.
  shieldWall: { role: 'tank', school: 'physical', scalingStat: 'con', targetMode: 'self', pveUse: ['sustain'] },
  // Evade: rogue mobility/evasion buff.
  evade: { role: 'mobility', school: 'physical', scalingStat: 'dex', targetMode: 'self', pveUse: ['escape'] },
  // RapidFire: multi-hit ranger DPS.
  rapidFire: { role: 'damage', school: 'physical', scalingStat: 'dex', targetMode: 'enemy', pveUse: ['single-target', 'finisher'] },
  // Volley: ranger pack-clear AoE.
  volley: { role: 'damage', school: 'physical', scalingStat: 'dex', targetMode: 'area-self', pveUse: ['pack'] },
  // Backstab: rogue burst opener.
  backstab: { role: 'damage', school: 'physical', scalingStat: 'dex', targetMode: 'enemy', pveUse: ['opener', 'finisher'] },
  // PoisonBlade: rogue DoT.
  poisonBlade: { role: 'damage', school: 'poison', scalingStat: 'dex', targetMode: 'enemy', pveUse: ['single-target', 'sustain'] },
  // Bash: warrior CC.
  bash: { role: 'control', school: 'physical', scalingStat: 'str', targetMode: 'enemy', pveUse: ['single-target', 'opener'] },
};

export function getSkillTags(skill: SkillDef): ResolvedSkillTags {
  const overrides = SKILL_TAG_OVERRIDES[skill.id] ?? {};
  return {
    role: overrides.role ?? skill.role ?? inferRole(skill),
    school: overrides.school ?? skill.school ?? inferSchool(skill),
    scalingStat: overrides.scalingStat ?? skill.scalingStat ?? inferScalingStat(skill),
    targetMode: overrides.targetMode ?? skill.targetMode ?? inferTargetMode(skill),
    pveUse: overrides.pveUse ?? skill.pveUse ?? inferPveUse(skill),
  };
}

function inferRole(skill: SkillDef): SkillRole {
  if (skill.id.startsWith('passive_')) return 'passive';
  const hasHeal = skill.effects?.some((e) => e.type === 'heal');
  if (hasHeal) return 'heal';
  const hasShield = skill.effects?.some((e) => e.type === 'shield');
  if (hasShield) return 'tank';
  const hasCc = skill.effects?.some((e) => e.type === 'stun' || e.type === 'freeze' || e.type === 'taunt');
  if (hasCc && (skill.dmg ?? 0) === 0) return 'control';
  if (skill.dmg && skill.dmg > 0) return 'damage';
  return 'utility';
}

function inferSchool(skill: SkillDef): SkillSchool {
  if (skill.damageElement) return skill.damageElement;
  return skill.kind === 'physical' ? 'physical' : 'arcane';
}

function inferScalingStat(skill: SkillDef): SkillScalingStat {
  if (skill.kind === 'physical') return 'str';
  if (skill.kind === 'utility') return 'wit';
  return 'int';
}

function inferTargetMode(skill: SkillDef): SkillTargetMode {
  if (skill.id.startsWith('passive_')) return 'passive';
  if (skill.selfTarget) return 'self';
  if (skill.cat === 'aura') return 'self';
  if (skill.area && skill.area > 0) return 'area-self';
  if (skill.requiresTarget) return 'enemy';
  // Projectile skills implicitly target an enemy even when
  // `requiresTarget` is omitted — the runtime resolves the target
  // from `cast.targetId` or the projectile path.
  if (skill.cat === 'projectile') return 'enemy';
  return 'self';
}

function inferPveUse(skill: SkillDef): SkillPveUse[] {
  const out: SkillPveUse[] = [];
  if (skill.area && skill.area > 0) out.push('pack');
  if (!out.includes('pack')) out.push('single-target');
  return out;
}

/**
 * Convenience for the validator + future balance report: every skill
 * id mapped to its resolved tag set.
 */
export function getAllSkillTags(): Record<SkillId, ResolvedSkillTags> {
  const out: Partial<Record<SkillId, ResolvedSkillTags>> = {};
  for (const [id, skill] of Object.entries(SKILLS)) {
    out[id as SkillId] = getSkillTags(skill);
  }
  return out as Record<SkillId, ResolvedSkillTags>;
}
