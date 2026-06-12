import { describe, expect, test } from 'vitest';
import {
  getTerrainHeight,
  glacialValeMask,
  sampleGrassDensity,
  sampleTerrain,
  GLACIAL_VALE,
  LAKE_WATER_Y,
} from '../packages/content/terrain';

const across = (m: number) => ({
  x: GLACIAL_VALE.x - GLACIAL_VALE.sin * m,
  z: GLACIAL_VALE.z + GLACIAL_VALE.cos * m,
});

describe('glacial vale terrain', () => {
  test('the tarn floor sits below the waterline so it holds water', () => {
    const h = getTerrainHeight(GLACIAL_VALE.x, GLACIAL_VALE.z);
    expect(h).toBeLessThan(LAKE_WATER_Y - 2);
  });

  test('walls climb from valley floor to an alpine rim', () => {
    const floor = getTerrainHeight(across(110).x, across(110).z);
    const mid = getTerrainHeight(across(280).x, across(280).z);
    expect(floor).toBeLessThan(15);
    expect(mid).toBeGreaterThan(40);
  });

  test('blade grass does not grow inside the vale', () => {
    expect(sampleGrassDensity(GLACIAL_VALE.x, GLACIAL_VALE.z)).toBe(0);
    expect(sampleGrassDensity(across(200).x, across(200).z)).toBeLessThan(0.05);
  });

  test('the vale is alpine tundra with sparse trees', () => {
    const s = sampleTerrain(across(150).x, across(150).z);
    expect(s.biome).toBe('tundra');
    expect(s.treeDensity).toBeLessThan(0.12);
  });

  test('the override does not leak outside its mask', () => {
    expect(glacialValeMask(-2_650, -1_200)).toBe(0);
    expect(glacialValeMask(0, 0)).toBe(0);
    // a point just outside keeps the base relief (mask exactly 0 ⇒ identity)
    const h = getTerrainHeight(-1_500, -2_350);
    expect(Number.isFinite(h)).toBe(true);
    expect(glacialValeMask(-1_500, -2_350)).toBe(0);
  });
});
