import type { VecXZ } from '../protocol/messages.js';

/**
 * Safe town hubs the Escape skill can teleport a player back to.
 * Pure data — adding a new village means appending an entry, no code
 * changes elsewhere. `getNearestVillage` picks the closest by squared
 * XZ distance so the cast pipeline can hand any caster position in
 * and get a deterministic destination.
 *
 * The level field gates which villages a player can escape *to*: a
 * lv1 player can only return to Talking Island, so the system never
 * teleports a newbie into a high-level hub they couldn't survive.
 */
export interface Village {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  /** Minimum player level for the Escape skill to route here. */
  minLevel: number;
}

export const VILLAGES: readonly Village[] = [
  {
    id: 'talking_island',
    name: 'Talking Island',
    position: { x: 0, y: 0.5, z: 0 },
    minLevel: 1,
  },
  {
    id: 'gludin',
    name: 'Gludin Village',
    position: { x: 120, y: 0.5, z: 80 },
    minLevel: 10,
  },
  {
    id: 'dion',
    name: 'Dion',
    position: { x: -140, y: 0.5, z: 60 },
    minLevel: 20,
  },
];

/**
 * Pick the closest village (by XZ distance) the caster's level
 * qualifies for. Falls back to the first village if none match
 * (shouldn't happen — Talking Island is lv1).
 */
export function getNearestVillage(from: VecXZ, level: number): Village {
  let best: Village = VILLAGES[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const v of VILLAGES) {
    if (v.minLevel > level) continue;
    const dx = v.position.x - from.x;
    const dz = v.position.z - from.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}
