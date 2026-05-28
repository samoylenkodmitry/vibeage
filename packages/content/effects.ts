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
export type EffectType = SkillEffectType | 'invuln';

/**
 * §46/slice-2 — explicit per-effect stacking policy. Was implicit
 * before: `upsertStatusEffect` replaced any same-type effect, and
 * an undeclared `effect.stackable` field nobody set added a dead
 * stacks-up branch. Now every type opts into one of four policies:
 *
 *  - `replace`: new application overwrites the existing one wholesale
 *    (default for instant effects: damage, heal, dispel).
 *  - `refresh`: keep existing `value` / `stacks`; reset `startTimeTs`
 *    and lift `durationMs` to the longer of (remaining, new). Right
 *    for crowd-control / single-instance buffs you re-cast for
 *    upkeep (stun, slow, bless, evasion, shield, invisible).
 *  - `stack`: bump `stacks` up to `maxStacks`; reset start time so
 *    the duration is measured from the most recent application.
 *    Right for DoTs designed to stack (dot, burn, poison).
 *  - `reject`: if an active effect of this type exists, the new
 *    application is silently dropped — no opt-out today; reserved
 *    for future "no re-applying X while X is active" rules.
 *
 * `maxStacks` defaults to 1 and is only honoured when `stacking`
 * is `'stack'`.
 */
export type StackingPolicy = 'replace' | 'refresh' | 'stack' | 'reject';

export interface EffectSpec {
  type: EffectType;
  label: string;
  description: string;
  category: EffectCategory;
  icon: string;
  /** Human-readable unit hint for SkillEffect.value, e.g. 'hp', '%', 'm'. */
  valueUnit?: string;
  /** §46/slice-2 — how `upsertStatusEffect` reconciles same-type re-applications. */
  stacking?: StackingPolicy;
  /** §46/slice-2 — cap for `stacking: 'stack'`. Ignored otherwise. */
  maxStacks?: number;
}

const EFFECT_ICON_SLUGS: Record<EffectType, string> = {
  damage: 'damage',
  heal: 'heal',
  stun: 'stun',
  slow: 'slow',
  dot: 'dot',
  burn: 'burn',
  poison: 'poison',
  waterWeakness: 'water-weakness',
  freeze: 'freeze',
  shield: 'shield',
  bless: 'bless',
  dispel: 'dispel',
  taunt: 'taunt',
  knockback: 'knockback',
  evasion: 'evasion',
  invisible: 'invisible',
  speed_boost: 'haste',
  attackSpeed: 'attack-speed',
  reveal_loot: 'treasure-sense',
  aggroReset: 'aggro-reset',
  teleport: 'teleport',
  invuln: 'invulnerable',
};

export function effectIconPath(effectType: EffectType): string {
  return `/game/effects/effect-icon-${EFFECT_ICON_SLUGS[effectType]}.png`;
}

type EffectSpecInput = Omit<EffectSpec, 'icon'>;

function withGeneratedEffectIcons(specs: Record<EffectType, EffectSpecInput>): Record<EffectType, EffectSpec> {
  return Object.fromEntries(
    Object.entries(specs).map(([type, spec]) => [
      type,
      { ...spec, icon: effectIconPath(type as EffectType) },
    ]),
  ) as Record<EffectType, EffectSpec>;
}

const EFFECT_SPEC_DEFS: Record<EffectType, EffectSpecInput> = {
  damage: {
    type: 'damage',
    label: 'Damage',
    description: 'Inflicts a flat amount of damage on application.',
    category: 'damage',
    valueUnit: 'hp',
    stacking: 'replace',
  },
  heal: {
    type: 'heal',
    label: 'Heal',
    description: 'Restores health to the target.',
    category: 'heal',
    valueUnit: 'hp',
    stacking: 'replace',
  },
  stun: {
    type: 'stun',
    label: 'Stun',
    description: 'Locks movement, casting, and attacks for the duration.',
    category: 'debuff',
    stacking: 'refresh',
  },
  slow: {
    type: 'slow',
    label: 'Slow',
    description: 'Reduces target movement speed by the listed percent.',
    category: 'debuff',
    valueUnit: '%',
    stacking: 'refresh',
  },
  dot: {
    type: 'dot',
    label: 'Bleed',
    description: 'Ticks damage every second over the duration.',
    category: 'debuff',
    valueUnit: 'hp/s',
    stacking: 'stack',
    maxStacks: 3,
  },
  burn: {
    type: 'burn',
    label: 'Burn',
    description: 'Fire damage tick over time.',
    category: 'debuff',
    valueUnit: 'hp/s',
    stacking: 'stack',
    maxStacks: 3,
  },
  poison: {
    type: 'poison',
    label: 'Poison',
    description: 'Poison damage tick — bypasses armor.',
    category: 'debuff',
    valueUnit: 'hp/s',
    stacking: 'stack',
    maxStacks: 3,
  },
  waterWeakness: {
    type: 'waterWeakness',
    label: 'Water Weakness',
    description: 'Target takes the listed % more damage from water attacks.',
    category: 'debuff',
    valueUnit: '%',
    stacking: 'refresh',
  },
  freeze: {
    type: 'freeze',
    label: 'Freeze',
    description: 'Target is locked solid; cannot act.',
    category: 'debuff',
    stacking: 'refresh',
  },
  shield: {
    type: 'shield',
    label: 'Shield',
    description: 'Absorbs incoming damage up to the listed amount, then breaks.',
    category: 'buff',
    valueUnit: 'hp',
    stacking: 'refresh',
  },
  bless: {
    type: 'bless',
    label: 'Bless',
    description: "Increases the caster's outgoing damage by the listed percent and adds the same value as accuracy.",
    category: 'buff',
    valueUnit: '%',
    stacking: 'refresh',
  },
  dispel: {
    type: 'dispel',
    label: 'Dispel',
    description: 'Strips a negative status effect (applied once, no duration).',
    category: 'utility',
    stacking: 'replace',
  },
  taunt: {
    type: 'taunt',
    label: 'Taunt',
    description: 'Forces the target enemy to attack the caster for the duration.',
    category: 'debuff',
    stacking: 'refresh',
  },
  knockback: {
    type: 'knockback',
    label: 'Knockback',
    description: 'Pushes the target back the listed distance.',
    category: 'debuff',
    valueUnit: 'm',
    stacking: 'replace',
  },
  evasion: {
    type: 'evasion',
    label: 'Evasion',
    description: 'Increases dodge chance by the listed percent.',
    category: 'buff',
    valueUnit: '%',
    stacking: 'refresh',
  },
  invisible: {
    type: 'invisible',
    label: 'Invisible',
    description: 'Breaks enemy aggro and hides the player from their searches.',
    category: 'buff',
    stacking: 'refresh',
  },
  speed_boost: {
    type: 'speed_boost',
    label: 'Haste',
    description: 'Increases movement speed by the listed percent.',
    category: 'buff',
    valueUnit: '%',
    stacking: 'refresh',
  },
  attackSpeed: {
    type: 'attackSpeed',
    label: 'Attack Speed',
    description: 'Increases attack speed (shorter auto-attack interval) by the listed percent.',
    category: 'buff',
    valueUnit: '%',
    stacking: 'refresh',
  },
  reveal_loot: {
    type: 'reveal_loot',
    label: 'Treasure Sense',
    description: 'Reveals nearby ground loot — names shown at a glance for the duration.',
    category: 'buff',
    stacking: 'refresh',
  },
  aggroReset: {
    type: 'aggroReset',
    label: 'Aggro Reset',
    description: "Drops every nearby attacker's threat on the caster instantly.",
    category: 'buff',
    stacking: 'replace',
  },
  teleport: {
    type: 'teleport',
    label: 'Teleport',
    description: 'Recalls the caster to the nearest safe village they qualify for.',
    category: 'utility',
    stacking: 'replace',
  },
  invuln: {
    type: 'invuln',
    label: 'Invulnerable',
    description: 'Negates incoming damage for the duration.',
    category: 'buff',
    stacking: 'refresh',
  },
};

export const EFFECT_SPECS = withGeneratedEffectIcons(EFFECT_SPEC_DEFS);

/**
 * §46/slice-2 — default policy when a spec doesn't declare one.
 * Conservative: behave like the legacy "overwrite same-type" path
 * so unknown / future effect types don't silently get richer
 * semantics than the author chose.
 */
const DEFAULT_STACKING_POLICY: StackingPolicy = 'replace';

export function getStackingPolicy(type: SkillEffectType): StackingPolicy {
  return EFFECT_SPECS[type]?.stacking ?? DEFAULT_STACKING_POLICY;
}

export function getMaxStacks(type: SkillEffectType): number {
  return EFFECT_SPECS[type]?.maxStacks ?? 1;
}

export function getEffectSpec(type: string): EffectSpec | null {
  return EFFECT_SPECS[type as EffectType] ?? null;
}

export function getEffectLabel(type: string): string {
  return getEffectSpec(type)?.label ?? type;
}
