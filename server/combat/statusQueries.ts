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
