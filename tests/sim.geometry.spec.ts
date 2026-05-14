import { describe, expect, test } from 'vitest';
import {
  directionXZ,
  distanceSqXZ,
  distanceXZ,
  randomAnnulusDistance,
  rotationYForDirection,
} from '../packages/sim/geometry';

describe('shared XZ geometry helpers', () => {
  test('computes distances and directions consistently', () => {
    expect(distanceSqXZ({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(25);
    expect(distanceXZ({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(directionXZ({ x: 0, z: 0 }, { x: 3, z: 4 })).toEqual({ x: 0.6, z: 0.8 });
    expect(directionXZ({ x: 1, z: 1 }, { x: 1, z: 1 })).toEqual({ x: 0, z: 0 });
    expect(rotationYForDirection({ x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
  });

  test('samples annulus distances inside the requested area', () => {
    expect(randomAnnulusDistance(35, 100, 0)).toBe(35);
    expect(randomAnnulusDistance(35, 100, 1)).toBe(100);
    expect(randomAnnulusDistance(35, 100, -1)).toBe(35);
    expect(randomAnnulusDistance(35, 100, 2)).toBe(100);
  });
});
