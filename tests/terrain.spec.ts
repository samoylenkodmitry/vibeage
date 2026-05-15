import { describe, expect, test } from 'vitest';
import { getTerrainBiome, getTerrainHeight, sampleTerrain } from '../packages/content/terrain';

describe('world terrain contract', () => {
  test('keeps the starter area nearly flat but not globally flat', () => {
    expect(Math.abs(getTerrainHeight(0, 0))).toBeLessThan(0.01);
    expect(Math.abs(getTerrainHeight(60, -40))).toBeLessThan(1.5);
    expect(Math.abs(getTerrainHeight(240_000, -120_000))).toBeGreaterThan(1);
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
