import type { TerrainBiome } from './terrain.js';

/**
 * Terrain biome per named zone, so the ground/foliage under "Volcanic
 * Wastes" actually looks volcanic, "Frozen Tundra" snowy, etc.
 *
 * Why a standalone table (not read from zones.ts): zones.ts already
 * imports terrain.ts (`getTerrainHeight`), so terrain.ts importing
 * zones.ts back would be a require cycle. This module's only import is
 * a TYPE (erased at runtime), so terrain.ts → zoneBiomes is cycle-free.
 * A test (zoneBiomes.spec) asserts these stay in sync with GAME_ZONES.
 *
 * Coordinates + radii mirror the zone definitions in zones.ts.
 */
export type ZoneBiomeEntry = { id: string; x: number; z: number; radius: number; biome: TerrainBiome };

export const ZONE_BIOMES: readonly ZoneBiomeEntry[] = [
  { id: 'starter_meadow', x: 0, z: 0, radius: 100, biome: 'meadow' },
  { id: 'dark_forest', x: 200, z: 200, radius: 150, biome: 'forest' },
  { id: 'rocky_highlands', x: -200, z: -200, radius: 120, biome: 'highland' },
  { id: 'misty_lake', x: -150, z: 250, radius: 100, biome: 'wetland' },
  { id: 'cursed_ruins', x: 400, z: -100, radius: 130, biome: 'ruins' },
  { id: 'dragon_peaks', x: -400, z: 300, radius: 160, biome: 'highland' },
  { id: 'shadow_valley', x: 300, z: 400, radius: 140, biome: 'abyssal' },
  { id: 'crystal_caverns', x: -300, z: -400, radius: 130, biome: 'ethereal' },
  { id: 'volcanic_wastes', x: 500, z: -300, radius: 170, biome: 'volcanic' },
  { id: 'frozen_tundra', x: -500, z: 500, radius: 180, biome: 'tundra' },
  { id: 'ethereal_gardens', x: 600, z: 400, radius: 160, biome: 'ethereal' },
  { id: 'abyssal_depths', x: -600, z: -600, radius: 200, biome: 'abyssal' },
  { id: 'celestial_peaks', x: 700, z: -500, radius: 190, biome: 'celestial' },
  { id: 'temporal_rifts', x: -700, z: 700, radius: 150, biome: 'temporal' },
];

/** Each zone's territory reaches this multiple of its radius, so the
 *  themed biomes meet + fill the gaps between zones (a Voronoi-ish
 *  partition of the content area) instead of leaving meadow seams. */
const ZONE_REACH = 2.5;

/**
 * Biome of the nearest zone whose reach covers `(x, z)`, or null when
 * the point is beyond every zone (terrain.ts then uses its default).
 */
export function biomeAtZone(x: number, z: number): TerrainBiome | null {
  let best: ZoneBiomeEntry | null = null;
  let bestDist = Infinity;
  for (const zone of ZONE_BIOMES) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    if (dist <= zone.radius * ZONE_REACH && dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  }
  return best ? best.biome : null;
}

/** Baseline meadow weight so gaps between zones (and zone edges) blend
 *  into meadow instead of cutting a hard seam. */
const MEADOW_BASELINE = 0.22;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Soft biome weights at `(x, z)` — each zone contributes a weight that
 * is 1 well inside its radius and fades to 0 by `radius × reach`, plus a
 * meadow baseline. Normalized. terrain.ts blends the biome colours +
 * densities by these so adjacent biomes transition smoothly instead of
 * snapping at a hard Voronoi edge.
 */
export function biomeWeights(x: number, z: number): Map<TerrainBiome, number> {
  const weights = new Map<TerrainBiome, number>();
  let total = MEADOW_BASELINE;
  weights.set('meadow', MEADOW_BASELINE);
  for (const zone of ZONE_BIOMES) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    // 1 inside 0.6r, fading to 0 by reach·r.
    const w = 1 - smooth(zone.radius * 0.6, zone.radius * ZONE_REACH, dist);
    if (w <= 0) continue;
    weights.set(zone.biome, (weights.get(zone.biome) ?? 0) + w);
    total += w;
  }
  for (const [b, w] of weights) weights.set(b, w / total);
  return weights;
}
