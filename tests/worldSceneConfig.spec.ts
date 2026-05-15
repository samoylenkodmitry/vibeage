import { describe, expect, test } from 'vitest';
import { getTerrainHeight } from '../packages/content/terrain';
import { getTerrainY, GROUND_Y } from '../apps/client/src/worldSceneConfig';

describe('worldSceneConfig', () => {
  test('getTerrainY equals GROUND_Y plus the procedural terrain height at xz', () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [120, -340],
      [-2_400, 7_900],
      [85_000, -42_000],
    ];

    for (const [x, z] of samples) {
      expect(getTerrainY(x, z)).toBeCloseTo(GROUND_Y + getTerrainHeight(x, z));
    }
  });

  test('returns a finite y far from spawn so entities are not lost below the terrain mesh', () => {
    const farY = getTerrainY(50_000, 50_000);
    expect(Number.isFinite(farY)).toBe(true);
    expect(farY).toBeGreaterThan(-100);
    expect(farY).toBeLessThan(100);
  });

  test('matches the height the terrain mesh renders at within the same xz cell', () => {
    const x = 1_234.56;
    const z = -789.01;
    expect(getTerrainY(x, z)).toBe(GROUND_Y + getTerrainHeight(x, z));
  });
});
