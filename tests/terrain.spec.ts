import { describe, expect, test } from 'vitest';
import {
  computeNearbyLakes,
  getTerrainBiome,
  getTerrainHeight,
  LAKE_BED_Y,
  LAKE_WATER_Y,
  sampleTerrain,
  TOWN_PLATEAUS,
} from '../packages/content/terrain';

describe('world terrain contract', () => {
  test('keeps the starter area nearly flat but not globally flat', () => {
    expect(Math.abs(getTerrainHeight(0, 0))).toBeLessThan(0.01);
    expect(Math.abs(getTerrainHeight(60, -40))).toBeLessThan(1.5);
    expect(Math.abs(getTerrainHeight(240_000, -120_000))).toBeGreaterThan(1);
  });

  test('keeps the authored cozy-coast waterline flat', () => {
    // The water plane spans x ∈ [-320,-40], z ∈ [-260,260] (worldArtScenes);
    // terrain must not rise above / sink below the flat water there.
    for (const [x, z] of [[-320, 260], [-320, -260], [-40, 260], [-40, -260], [-180, 0]] as const) {
      expect(Math.abs(getTerrainHeight(x, z))).toBeLessThan(0.2);
    }
  });

  test('has dramatic relief in the wider world', () => {
    // Hills/ridges/valleys must actually register at L2/Crysis scale: peaks
    // well above 30 m and dips well below -20 m somewhere within 3 km.
    let min = Infinity;
    let max = -Infinity;
    for (let x = -3000; x <= 3000; x += 37) {
      for (let z = -3000; z <= 3000; z += 37) {
        const h = getTerrainHeight(x, z);
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    expect(max).toBeGreaterThan(30);
    expect(min).toBeLessThan(-20);
  });

  test('returns deterministic biome visuals for large-world coordinates', () => {
    const first = sampleTerrain(300_000, -160_000);
    const second = sampleTerrain(300_000, -160_000);

    expect(first).toEqual(second);
    expect(first.biome).toBe(getTerrainBiome(300_000, -160_000));
    expect(first.groundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(first.treeDensity).toBeGreaterThanOrEqual(0);
    expect(first.grassDensity).toBeGreaterThanOrEqual(0);
  });

  test('lakes: analytic centres sit at the bed and have a real shoreline', () => {
    const lakes = computeNearbyLakes(0, 0, 8000);
    expect(lakes.length).toBeGreaterThan(3);
    for (const lake of lakes.slice(0, 8)) {
      const centre = getTerrainHeight(lake.x, lake.z);
      // Centre carved to the bed, well below the waterline…
      expect(centre).toBeLessThan(LAKE_WATER_Y - 3);
      expect(Math.abs(centre - LAKE_BED_Y)).toBeLessThan(2.5);
      // …and the terrain must rise back through the waterline within 700 m
      // (that crossing IS the shoreline; the water disc hides beyond it).
      let crossed = false;
      for (let r = 50; r <= 700; r += 10) {
        if (getTerrainHeight(lake.x + r, lake.z) > LAKE_WATER_Y) { crossed = true; break; }
      }
      expect(crossed).toBe(true);
    }
    // No lake may carve inside the authored-zone ring.
    for (const lake of lakes) {
      expect(Math.hypot(lake.x, lake.z)).toBeGreaterThanOrEqual(900);
    }
  });

  test('settlement plateaus are level where the houses stand', () => {
    for (const plateau of TOWN_PLATEAUS) {
      // Inside ~0.7r the blend is fully the plateau level (smoothstep starts
      // at 0.7r), so every building footprint is flat.
      for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.4, 0.4], [0, -0.6], [0.45, 0.45]] as const) {
        const h = getTerrainHeight(plateau.x + dx * plateau.r, plateau.z + dz * plateau.r);
        expect(Math.abs(h - plateau.y)).toBeLessThan(0.01);
      }
    }
  });

  test('canyons: deep gorges exist beyond the spawn ring', () => {
    let deepest = 0;
    for (let x = 900; x <= 6000; x += 31) {
      for (let z = -6000; z <= 6000; z += 37) {
        const h = getTerrainHeight(x, z);
        if (h < deepest) deepest = h;
      }
    }
    expect(deepest).toBeLessThan(-30);
  });
});
