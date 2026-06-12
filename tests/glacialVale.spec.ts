import { describe, expect, test } from 'vitest';
import {
  getTerrainHeight,
  glacialValeMask,
  sampleGrassDensity,
  sampleTerrain,
  GLACIAL_VALE,
  VALE_TARN_WATER_Y,
} from '../packages/content/terrain';

// vale-local → world (u along the valley axis, v across)
const at = (u: number, v: number) => ({
  x: GLACIAL_VALE.x + u * GLACIAL_VALE.cos - v * GLACIAL_VALE.sin,
  z: GLACIAL_VALE.z + u * GLACIAL_VALE.sin + v * GLACIAL_VALE.cos,
});

describe('glacial vale terrain (deedy/glacial-valley port)', () => {
  test('the braided river bed dips below the waterline somewhere mid-valley', () => {
    let minH = Infinity;
    for (let v = -80; v <= 100; v += 2) {
      const p = at(0, v);
      minH = Math.min(minH, getTerrainHeight(p.x, p.z));
    }
    expect(minH).toBeLessThan(VALE_TARN_WATER_Y - 0.8);
  });

  test('the valley climbs from banks to walls', () => {
    const bank = getTerrainHeight(at(0, 120).x, at(0, 120).z);
    const wall = getTerrainHeight(at(0, 380).x, at(0, 380).z);
    expect(bank).toBeLessThan(15);
    expect(wall).toBeGreaterThan(30);
  });

  test('blade grass is hard-zero inside the vale (no GLSL mirror needed)', () => {
    expect(sampleGrassDensity(at(0, 18).x, at(0, 18).z)).toBe(0);
    expect(sampleGrassDensity(at(-300, -150).x, at(-300, -150).z)).toBe(0);
  });

  test('the vale core is treeless alpine tundra', () => {
    const s = sampleTerrain(at(0, 60).x, at(0, 60).z);
    expect(s.biome).toBe('tundra');
    expect(s.treeDensity).toBeLessThan(0.01);
  });

  test('the override does not leak outside its mask', () => {
    expect(glacialValeMask(-2_650, -1_200)).toBe(0);
    expect(glacialValeMask(0, 0)).toBe(0);
  });
});
