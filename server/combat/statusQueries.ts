import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { DispelCategory } from '../../packages/content/skills.js';
import { computeMissChance } from '../../packages/sim/combatMath.js';
import { ACCURACY_BASELINE, MAX_DODGE_CHANCE } from '../../packages/content/stats.js';

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

export function isEntityStunned(entity: PlayerState | Enemy, now: number): boolean {
  return (entity.statusEffects ?? []).some((effect) => {
    if (!ACTION_BLOCKING_EFFECT_TYPES.has(effect.type)) return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}

/**
 * §52 #10 — which effect types each dispel category strips.
 *
 *   negative — default; matches the pre-§52 hardcoded set.
 *   positive — buff purge (heal-over-time, shield, bless, etc.).
 *   poison   — only poison-flavoured ticks (poison + generic dot).
 *   stun     — only action-blocking effects.
 *   shield   — only damage-absorb shields.
 *   bleed    — reserved; no bleed effect exists today.
 *   magic    — reserved; no magic-flagged effects exist today.
 *
 * The two reserved entries land as empty sets so a content
 * designer can ship a "Cleanse Bleed" / "Antimagic" skill against
 * future status types without re-touching this map.
 */
const DISPEL_CATEGORY_TARGETS: Readonly<Record<DispelCategory, ReadonlySet<string>>> = {
  negative: new Set(['slow', 'stun', 'burn', 'poison', 'dot', 'freeze', 'waterWeakness']),
  positive: new Set(['heal', 'shield', 'bless', 'evasion', 'invisible', 'speed_boost', 'attackSpeed', 'reveal_loot', 'invuln']),
  poison: new Set(['poison', 'dot']),
  stun: new Set(['stun', 'freeze', 'root']),
  shield: new Set(['shield']),
  bleed: new Set<string>(),
  magic: new Set<string>(),
};

export function dispelTargetSet(category: DispelCategory): ReadonlySet<string> {
  return DISPEL_CATEGORY_TARGETS[category];
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
  now: number,
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
  return Math.min(MAX_DODGE_CHANCE, totalPct / 100);
}

/**
 * Total chance (0..1) that an incoming hit on `target` is dodged:
 * the accuracy-vs-evasion stat differential (`computeMissChance`)
 * plus any flat evasion-*buff* dodge (`evasionMissChanceFor`),
 * clamped to the shared cap. `attackerAccuracy` defaults to the
 * baseline (an attacker with no accuracy stat is neutral). Shared by
 * the player-cast path and the enemy-attack path so both resolve
 * dodges identically.
 */
export function incomingMissChance(
  attackerAccuracy: number | undefined,
  target: PlayerState | Enemy | null | undefined,
  now: number,
): number {
  if (!target) return 0;
  // Every combatant carries a `stats` block (players + mobs), so the
  // target's evasion reads uniformly — no type-test, no shared default.
  const targetEvasion = target.stats?.evasion ?? 0;
  const statDodge = computeMissChance(attackerAccuracy ?? ACCURACY_BASELINE, targetEvasion);
  return Math.min(MAX_DODGE_CHANCE, evasionMissChanceFor(target, now) + statDodge);
}
