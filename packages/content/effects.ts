import type { SkillEffectType } from './skills.js';

/**
 * Display-layer metadata for every status-effect type. Lives in the
 * content layer (not the UI) so future tools — auto-generated wiki,
 * combat log formatter, balance spreadsheet exporter — read the same
 * canonical record instead of re-typing labels in each consumer.
 *
 * `valueUnit` documents what `SkillEffect.value` means for this type
 * so the wiki / tooltip can format it (raw HP, percent multiplier,
 * percent slow, etc.) without baking the unit into the consumer.
 *
 * `category` distinguishes player-buff effects (player wants stacked
 * on themselves) from debuffs (player wants on the enemy) — useful
 * for tooltip coloring and future buff-stacking policy work.
 */
export type EffectCategory = 'buff' | 'debuff' | 'damage' | 'heal' | 'utility';

export interface EffectSpec {
  type: SkillEffectType;
  label: string;
  description: string;
  category: EffectCategory;
  /** Human-readable unit hint for SkillEffect.value, e.g. 'hp', '%', 'm'. */
  valueUnit?: string;
}

export const EFFECT_SPECS: Record<SkillEffectType, EffectSpec> = {
  damage: {
    type: 'damage',
    label: 'Damage',
    description: 'Inflicts a flat amount of damage on application.',
    category: 'damage',
    valueUnit: 'hp',
  },
  heal: {
    type: 'heal',
    label: 'Heal',
    description: 'Restores health to the target.',
    category: 'heal',
    valueUnit: 'hp',
  },
  stun: {
    type: 'stun',
    label: 'Stun',
    description: 'Locks movement, casting, and attacks for the duration.',
    category: 'debuff',
  },
  slow: {
    type: 'slow',
    label: 'Slow',
    description: 'Reduces target movement speed by the listed percent.',
    category: 'debuff',
    valueUnit: '%',
  },
  dot: {
    type: 'dot',
    label: 'Bleed',
    description: 'Ticks damage every second over the duration.',
    category: 'debuff',
    valueUnit: 'hp/s',
  },
  burn: {
    type: 'burn',
    label: 'Burn',
    description: 'Fire damage tick — fire-weak enemies take extra.',
    category: 'debuff',
    valueUnit: 'hp/s',
  },
  poison: {
    type: 'poison',
    label: 'Poison',
    description: 'Poison damage tick — bypasses armor.',
    category: 'debuff',
    valueUnit: 'hp/s',
  },
  waterWeakness: {
    type: 'waterWeakness',
    label: 'Water Weakness',
    description: 'Target takes the listed % more damage from water attacks.',
    category: 'debuff',
    valueUnit: '%',
  },
  freeze: {
    type: 'freeze',
    label: 'Freeze',
    description: 'Target is locked solid; cannot act.',
    category: 'debuff',
  },
  shield: {
    type: 'shield',
    label: 'Shield',
    description: 'Absorbs incoming damage up to the listed amount, then breaks.',
    category: 'buff',
    valueUnit: 'hp',
  },
  bless: {
    type: 'bless',
    label: 'Bless',
    description: "Increases the caster's outgoing damage by the listed percent.",
    category: 'buff',
    valueUnit: '%',
  },
  dispel: {
    type: 'dispel',
    label: 'Dispel',
    description: 'Strips a negative status effect (applied once, no duration).',
    category: 'utility',
  },
  taunt: {
    type: 'taunt',
    label: 'Taunt',
    description: 'Forces the target enemy to attack the caster for the duration.',
    category: 'debuff',
  },
  knockback: {
    type: 'knockback',
    label: 'Knockback',
    description: 'Pushes the target back the listed distance.',
    category: 'debuff',
    valueUnit: 'm',
  },
  evasion: {
    type: 'evasion',
    label: 'Evasion',
    description: 'Increases dodge chance by the listed percent.',
    category: 'buff',
    valueUnit: '%',
  },
  invisible: {
    type: 'invisible',
    label: 'Invisible',
    description: 'Breaks enemy aggro and hides the player from their searches.',
    category: 'buff',
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    description: 'Converts the target into stone (or equivalent) for the duration.',
    category: 'debuff',
  },
};

/**
 * Returns the spec for a known effect type, or `undefined` for stray
 * values coming over the wire. The Record<...> binds the mapping at
 * compile time but runtime data could carry an unknown `type` string
 * (older save / future content), so consumers must handle undefined.
 */
export function getEffectSpec(type: SkillEffectType): EffectSpec | undefined {
  return EFFECT_SPECS[type];
}

export function getEffectLabel(type: SkillEffectType): string {
  return EFFECT_SPECS[type]?.label ?? type;
}

export function getEffectDescription(type: SkillEffectType): string {
  return EFFECT_SPECS[type]?.description ?? '';
}

export function getEffectValueUnit(type: SkillEffectType): string {
  return EFFECT_SPECS[type]?.valueUnit ?? '';
}
