import type { Enemy, PlayerState } from '../../packages/sim/entities.js';

/**
 * Shared status-effect predicates used by movement, casting, and AI
 * loops. Centralised so a future schema change (e.g. effects gaining a
 * `caster` field) only requires one update. All helpers tolerate
 * missing/undefined `statusEffects` arrays and malformed startTimeTs /
 * durationMs values (`?? 0` fallback).
 */

/**
 * Effect types that block movement, casting, and attacking. Stun is the
 * canonical case; freeze and root behave identically today (no skill
 * currently distinguishes them in design). If a future skill needs
 * "you can cast but not move" semantics, split root into its own
 * predicate then.
 */
const ACTION_BLOCKING_EFFECT_TYPES: ReadonlySet<string> = new Set(['stun', 'freeze', 'root']);

export function isEntityStunned(entity: PlayerState | Enemy, now: number = Date.now()): boolean {
  return (entity.statusEffects ?? []).some((effect) => {
    if (!ACTION_BLOCKING_EFFECT_TYPES.has(effect.type)) return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}

/**
 * §52 #6 — sum active `evasion` status-effect values on the target
 * and return a 0..1 miss chance. Caps at 0.95 so a stacked buff can
 * never make a target literally untouchable. `effect.value` is in
 * percent (matches the content schema — Smoke Bomb 40, Mist Step 50).
 * Returns 0 when the target has no active evasion buff, preserving
 * the legacy "every hit lands" path for the common case.
 */
export function evasionMissChanceFor(
  target: PlayerState | Enemy | null | undefined,
  now: number = Date.now(),
): number {
  if (!target?.statusEffects?.length) return 0;
  let totalPct = 0;
  for (const effect of target.statusEffects) {
    if (effect.type !== 'evasion') continue;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    if (expiresAt <= now) continue;
    totalPct += effect.value ?? 0;
  }
  if (totalPct <= 0) return 0;
  return Math.min(0.95, totalPct / 100);
}
