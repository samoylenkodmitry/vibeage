/**
 * Ability schema (docs/ABILITY_SYSTEM.md) — the composable, data-driven
 * vocabulary every combatant's skills draw from. These describe an
 * ability's geometry, delivery, and caster-side mechanics so power lives
 * in spec, not in entity-type-specific code. The engine has ONE generic
 * resolver per axis; bosses and players share it.
 */

/** Geometry of which targets an ability affects, relative to its origin. */
export type AbilityShape =
  | { readonly kind: 'single' }
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'donut'; readonly innerRadius: number; readonly outerRadius: number }
  /** Wedge of `2×halfAngleDeg` opening toward the cast direction, out to `length`. */
  | { readonly kind: 'cone'; readonly length: number; readonly halfAngleDeg: number };

/** Which side(s) of the fight an ability's shape can hit. */
export type AbilityAffects = 'enemies' | 'allies' | 'self' | 'all';

/**
 * Telegraphed delivery: lock the origin/direction at cast start, show a
 * ground telegraph, and resolve the shape `windUpMs` later — so a slow,
 * dodgeable AOE (boss breath, mage meteor) is pure data, not boss code.
 */
export type AbilityTelegraph = { readonly windUpMs: number };

/** Spawn `count` mobs of `type` around the caster on resolution. */
export type SummonSpec = { readonly type: string; readonly count: number; readonly radius: number };

/** Move the caster to `offset` units behind the (locked) target on resolution. */
export type BlinkSpec = { readonly offset: number };
