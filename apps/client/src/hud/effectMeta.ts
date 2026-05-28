import type { StatusEffect } from '../../../../packages/protocol/messages';
import { EFFECT_SPECS, getEffectSpec } from '../../../../packages/content/effects';

/**
 * Single source of player-facing status-effect copy + helpers, shared
 * by the effect tooltip, the status pills, and the Active Effects
 * panel so a label/description is written once.
 */
export const EFFECT_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(EFFECT_SPECS).map(([type, spec]) => [type, spec.label]),
);

export const EFFECT_DESCRIPTION: Record<string, string> = Object.fromEntries(
  Object.entries(EFFECT_SPECS).map(([type, spec]) => [type, spec.description]),
);

/**
 * Effects that help the bearer. Used to colour buffs vs debuffs and
 * to split the Active Effects panel. Derived from the canonical specs;
 * teleport is instant utility, but it still reads as positive in the UI.
 */
const BENEFICIAL_EFFECTS: ReadonlySet<string> = new Set([
  ...Object.values(EFFECT_SPECS)
    .filter((spec) => spec.category === 'buff' || spec.category === 'heal')
    .map((spec) => spec.type),
  'teleport',
]);

export function isBeneficialEffect(type: string): boolean {
  return BENEFICIAL_EFFECTS.has(type);
}

/** True if `effects` has an unexpired effect of `type`. */
export function hasActiveEffect(
  effects: StatusEffect[] | undefined,
  type: string,
  now: number = Date.now(),
): boolean {
  if (!effects?.length) return false;
  return effects.some((e) => e.type === type && (effectRemainingMs(e, now) ?? 1) > 0);
}

export function effectLabel(type: string): string {
  return getEffectSpec(type)?.label ?? type;
}

export function effectIcon(type: string): string | null {
  return getEffectSpec(type)?.icon ?? null;
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
