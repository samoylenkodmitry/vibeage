/**
 * Damage-number lane allocator.
 *
 * A flurry (fast auto-attacks, an AoE volley, a DoT ticking on three mobs)
 * spawns numbers on top of each other at the same world point, and the result
 * is an unreadable blob of overlapping glyphs. Every number claims a LANE on
 * spawn instead: a fixed offset + start delay that unrolls the flurry into a
 * legible fan rather than a pile.
 *
 * Time-keyed, not position-keyed, because the numbers that actually collide
 * are the ones that spawn together — and DamageNumber is rendered inside its
 * event's group, so it never learns its own world position. Two different
 * targets hit by the same AoE land in different lanes, which is harmless (a
 * little variety) and much cheaper than a spatial index.
 */

export type DamageNumberLane = {
  /** Horizontal world-space offset from the impact point. */
  offsetX: number;
  /** Extra starting height — a stacked flurry unrolls upward. */
  offsetY: number;
  /** Sideways drift across the lifetime, so the fan keeps opening as it rises. */
  driftX: number;
  /** Seconds to hold before the rise starts — staggers the read in time, too. */
  delay: number;
};

/**
 * Two numbers further apart than this were never going to overlap, so the
 * allocator resets to the centre lane. ~0.4 s is a touch longer than the
 * fastest attack interval in the game, which keeps a sustained auto-attack
 * chain fanning instead of re-stacking on lane 0.
 */
const LANE_RESET_MS = 400;

/**
 * Six lanes: enough for the widest AoE volley that lands in one tick, few
 * enough that the fan stays inside the target's silhouette instead of
 * sprawling across the screen. Beyond six we wrap — by then the earliest
 * numbers have already risen clear.
 */
const LANE_OFFSETS: readonly { x: number; y: number }[] = [
  { x: 0.0, y: 0.0 },
  { x: -0.42, y: 0.16 },
  { x: 0.42, y: 0.3 },
  { x: -0.24, y: 0.46 },
  { x: 0.24, y: 0.6 },
  { x: 0.0, y: 0.74 },
];

/** How far a lane keeps sliding outward while it rises (world units). */
const LANE_DRIFT = 0.34;
/** Per-lane spawn delay — a 6-deep volley finishes unrolling in ~0.3 s. */
const LANE_DELAY_SECONDS = 0.055;

let lastClaimMs = -Infinity;
let nextIndex = 0;

/** Claim the next lane for a number spawning at `nowMs`. */
export function claimDamageNumberLane(nowMs: number): DamageNumberLane {
  const index = nowMs - lastClaimMs > LANE_RESET_MS ? 0 : (nextIndex + 1) % LANE_OFFSETS.length;
  lastClaimMs = nowMs;
  nextIndex = index;
  const offset = LANE_OFFSETS[index];
  return {
    offsetX: offset.x,
    offsetY: offset.y,
    driftX: Math.sign(offset.x) * LANE_DRIFT,
    delay: index * LANE_DELAY_SECONDS,
  };
}

/** Test seam — the allocator carries state between claims by design. */
export function resetDamageNumberLanes(): void {
  lastClaimMs = -Infinity;
  nextIndex = 0;
}
