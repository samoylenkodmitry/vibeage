import type { StatusEffect } from '../../../../packages/protocol/messages';

/**
 * Single source of player-facing status-effect copy + helpers, shared
 * by the effect tooltip, the status pills, and the Active Effects
 * panel so a label/description is written once.
 */
export const EFFECT_LABEL: Record<string, string> = {
  damage: 'Damage',
  heal: 'Heal over time',
  stun: 'Stun',
  slow: 'Slow',
  dot: 'Bleed',
  burn: 'Burn',
  poison: 'Poison',
  waterWeakness: 'Water weakness',
  freeze: 'Freeze',
  shield: 'Shield',
  bless: 'Bless',
  dispel: 'Dispel',
  taunt: 'Taunt',
  knockback: 'Knockback',
  evasion: 'Evasion',
  invisible: 'Invisible',
  invuln: 'Invulnerable',
  speed_boost: 'Haste',
  attackSpeed: 'Attack Speed',
  transform: 'Transform',
};

export const EFFECT_DESCRIPTION: Record<string, string> = {
  damage: 'Inflicts a flat amount of damage on application.',
  heal: 'Restores health.',
  stun: 'Locks movement, casting, and attacks for the duration.',
  slow: 'Reduces movement speed by the listed percentage.',
  dot: 'Ticks damage every second over the duration.',
  burn: 'Fire damage tick — fire-weak enemies take more.',
  poison: 'Poison damage tick — ignores armor.',
  waterWeakness: 'Target takes the listed % more damage from water attacks.',
  freeze: 'Target is locked solid; cannot act.',
  shield: 'Absorbs incoming damage up to the listed amount, then breaks.',
  bless: 'Increases the caster’s outgoing damage by the listed percent.',
  dispel: 'Strips a negative status effect (handled on apply, no duration).',
  taunt: 'Forces the target enemy to attack the caster for the duration.',
  knockback: 'Pushes the target back the listed distance.',
  evasion: 'Increases dodge chance by the listed percent.',
  invisible: 'Breaks enemy aggro and hides the player from their searches.',
  invuln: 'Negates all incoming damage for the duration.',
  speed_boost: 'Increases movement speed by the listed percent.',
  attackSpeed: 'Increases attack speed — shorter auto-attack interval — by the listed percent.',
  transform: 'Converts the target into stone (or equivalent) for the duration.',
};

/**
 * Effects that help the bearer. Used to colour buffs vs debuffs and
 * to split the Active Effects panel. Mirrors the server's beneficial
 * set (impactResolver BENEFICIAL_EFFECT_TYPES) plus speed_boost / invuln.
 */
const BENEFICIAL_EFFECTS: ReadonlySet<string> = new Set([
  'heal', 'shield', 'bless', 'evasion', 'invisible', 'invuln', 'speed_boost', 'attackSpeed', 'teleport',
]);

export function isBeneficialEffect(type: string): boolean {
  return BENEFICIAL_EFFECTS.has(type);
}

export function effectLabel(type: string): string {
  return EFFECT_LABEL[type] ?? type;
}

/** True when the effect carries both a start time and a duration. */
export function effectIsTimed(effect: StatusEffect): boolean {
  return effect.startTimeTs !== undefined && effect.durationMs !== undefined && effect.durationMs > 0;
}

/** Remaining lifetime in ms, or null for untimed effects. Never negative. */
export function effectRemainingMs(effect: StatusEffect, now: number = Date.now()): number | null {
  if (!effectIsTimed(effect)) return null;
  return Math.max(0, (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0) - now);
}

/** 0..1 fraction of the effect's duration still remaining. */
export function effectRemainingFraction(effect: StatusEffect, now: number = Date.now()): number {
  const remaining = effectRemainingMs(effect, now);
  if (remaining === null || !effect.durationMs) return 1;
  return Math.max(0, Math.min(1, remaining / effect.durationMs));
}

/**
 * Sum of the still-active `shield` absorb pools on an entity — the
 * damage the shield eats before HP. Drives the HP-bar overshield
 * overlay (shield is absorb-only, so it no longer shows up as
 * inflated max HP).
 */
export function totalShield(effects: StatusEffect[] | undefined, now: number = Date.now()): number {
  if (!effects?.length) return 0;
  let total = 0;
  for (const effect of effects) {
    if (effect.type !== 'shield') continue;
    if (effectRemainingMs(effect, now) === 0) continue; // timed-out (untimed shields keep their value)
    total += Math.max(0, effect.value ?? 0);
  }
  return total;
}
