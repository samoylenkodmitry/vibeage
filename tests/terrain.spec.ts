import { describe, expect, test } from 'vitest';
import { getTerrainBiome, getTerrainHeight, sampleTerrain } from '../packages/content/terrain';

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
});
