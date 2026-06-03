/**
 * Ability schema (docs/ABILITY_SYSTEM.md) — the composable, data-driven
 * vocabulary every combatant's skills draw from. These describe an
 * ability's geometry, delivery, and caster-side mechanics so power lives
 * in spec, not in entity-type-specific code. The engine has ONE generic
 * resolver per axis; bosses and players share it.
 */

/**
 * Where a shaped ability's origin sits when locked: `caster` (a nova /
 * breath centred on the caster — the default) or `target` (a ground-
 * targeted blast dropped on the locked target's position).
 */
export type ShapeAnchor = 'caster' | 'target';

/** Geometry of which targets an ability affects, relative to its origin. */
export type AbilityShape =
  | { readonly kind: 'single' }
  | { readonly kind: 'circle'; readonly radius: number; readonly anchor?: ShapeAnchor }
  | { readonly kind: 'donut'; readonly innerRadius: number; readonly outerRadius: number; readonly anchor?: ShapeAnchor }
  /** Wedge of `2×halfAngleDeg` opening toward the cast direction, out to `length`. */
  | { readonly kind: 'cone'; readonly length: number; readonly halfAngleDeg: number; readonly anchor?: ShapeAnchor };

/** Which side(s) of the fight an ability's shape can hit. */
export type AbilityAffects = 'enemies' | 'allies' | 'self' | 'all';

/**
 * Telegraphed delivery: lock the origin/direction at cast start, show a
 * ground telegraph, and resolve the shape `windUpMs` later — so a slow,
 * dodgeable AOE (boss breath, mage meteor) is pure data, not boss code.
 */
export type AbilityTelegraph = { readonly windUpMs: number };

/**
 * Spawn `count` mobs of `type` around the caster on resolution.
 *
 * The optional multipliers/name fields let designers build illusion or
 * decoy-style summons as content data: low-health, low-damage, no-XP/no-loot
 * copies can use the same spawn resolver as ordinary boss minions.
 */
export type SummonSpec = {
  readonly type: string;
  readonly count: number;
  readonly radius: number;
  readonly namePrefix?: string;
  readonly healthMultiplier?: number;
  readonly damageMultiplier?: number;
  readonly experienceMultiplier?: number;
  readonly lootTableIdOverride?: string;
};

/** Move the caster to `offset` units behind the (locked) target on resolution. */
export type BlinkSpec = { readonly offset: number };

/** Exchange caster and target positions on resolution. */
export type SwapSpec = Record<string, never>;
