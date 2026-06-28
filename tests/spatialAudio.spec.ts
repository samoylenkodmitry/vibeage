import { describe, expect, it } from 'vitest';
import { spatialGainFor, spatialPanFor } from '../apps/client/src/audio/spatial';

// Coordinate-aware SFX: distance attenuation + screen-relative stereo pan. The
// pure math is the audible behaviour, so it's what we lock down here.

describe('spatialGainFor', () => {
  it('is full close, silent far, and falls off monotonically between', () => {
    expect(spatialGainFor(0)).toBe(1);
    expect(spatialGainFor(7)).toBe(1);
    expect(spatialGainFor(75)).toBe(0);
    expect(spatialGainFor(300)).toBe(0);
    expect(spatialGainFor(20)).toBeGreaterThan(spatialGainFor(45));
    expect(spatialGainFor(45)).toBeGreaterThan(spatialGainFor(70));
  });
});

describe('spatialPanFor', () => {
  it('puts world -X on the right and +X on the left at yaw 0 (camera looks +Z)', () => {
    // Screen-right = (-cos yaw, sin yaw); at yaw 0 that's world -X.
    expect(spatialPanFor(-10, 0, 0)).toBeGreaterThan(0.9);
    expect(spatialPanFor(10, 0, 0)).toBeLessThan(-0.9);
  });

  it('centres a sound directly ahead or behind (±Z) at yaw 0', () => {
    expect(Math.abs(spatialPanFor(0, 10, 0))).toBeLessThan(0.01);
    expect(Math.abs(spatialPanFor(0, -10, 0))).toBeLessThan(0.01);
  });

  it('rotates the pan with the camera yaw', () => {
    expect(spatialPanFor(10, 0, Math.PI / 2)).not.toBeCloseTo(spatialPanFor(10, 0, 0));
  });

  it('stays within [-1, 1] and never NaN, including zero distance', () => {
    expect(spatialPanFor(0, 0, 1.2)).toBe(0);
    for (const [dx, dz] of [[100, -30], [-5, 80], [3, 3]]) {
      const pan = spatialPanFor(dx, dz, 0.7);
      expect(pan).toBeGreaterThanOrEqual(-1);
      expect(pan).toBeLessThanOrEqual(1);
    }
  });
});
