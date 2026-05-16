import type { Enemy, PlayerState } from '../../packages/sim/entities.js';

/**
 * Shared status-effect predicates used by movement, casting, and AI
 * loops. Centralised so a future schema change (e.g. effects gaining a
 * `caster` field) only requires one update. All helpers tolerate
 * missing/undefined `statusEffects` arrays and malformed startTimeTs /
 * durationMs values (`?? 0` fallback).
 */

export function isEntityStunned(entity: PlayerState | Enemy, now: number = Date.now()): boolean {
  return (entity.statusEffects ?? []).some((effect) => {
    if (effect.type !== 'stun') return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}
