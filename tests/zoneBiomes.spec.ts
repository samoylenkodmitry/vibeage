import { describe, expect, it } from 'vitest';
import { ZONE_BIOMES, biomeAtZone } from '../packages/content/zoneBiomes';
import { getTerrainBiome } from '../packages/content/terrain';
import { GAME_ZONES } from '../packages/content/zones';

/**
 * The zone→biome table (zoneBiomes.ts) is a hand-mirrored copy of the
 * zone centres/radii in zones.ts (kept separate to avoid a require
 * cycle). These pin that it stays in sync + that terrain resolves the
 * right biome at each zone, so "Volcanic Wastes" etc. look themed.
 */
describe('zone biomes', () => {
  it('every table entry matches the real zone centre + radius', () => {
    for (const entry of ZONE_BIOMES) {
      const zone = GAME_ZONES.find((z) => z.id === entry.id);
      expect(zone, `${entry.id} missing from GAME_ZONES`).toBeTruthy();
      expect(Math.round(zone!.position.x)).toBe(entry.x);
      expect(Math.round(zone!.position.z)).toBe(entry.z);
      expect(zone!.radius).toBe(entry.radius);
    }
  });

  it('terrain biome at each zone centre is that zone\'s theme', () => {
    for (const entry of ZONE_BIOMES) {
      expect(biomeAtZone(entry.x, entry.z), entry.id).toBe(entry.biome);
      expect(getTerrainBiome(entry.x, entry.z), `${entry.id} via terrain`).toBe(entry.biome);
    }
  });

  it('a few sample themes resolve as expected', () => {
    expect(getTerrainBiome(500, -300)).toBe('volcanic');  // Volcanic Wastes
    expect(getTerrainBiome(-500, 500)).toBe('tundra');     // Frozen Tundra
    expect(getTerrainBiome(0, 0)).toBe('meadow');          // spawn
  });
});
