import { describe, expect, test } from 'vitest';
import {
  computeDayPhase,
  computeSunDirection,
  DEFAULT_DAY_DURATION_MS,
  normalizePhase,
} from '../apps/client/src/timeOfDay';

describe('time of day cycle', () => {
  test('normalizes timestamps into a [0,1) phase regardless of magnitude or sign', () => {
    expect(normalizePhase(0, 1_000)).toBe(0);
    expect(normalizePhase(500, 1_000)).toBe(0.5);
    expect(normalizePhase(1_500, 1_000)).toBeCloseTo(0.5);
    expect(normalizePhase(-250, 1_000)).toBeCloseTo(0.75);
  });

  test('wraps continuously across day boundaries with no NaNs from absurd inputs', () => {
    expect(normalizePhase(Number.NaN)).toBe(0);
    expect(normalizePhase(0, 0)).toBe(0);
    expect(normalizePhase(1e15, DEFAULT_DAY_DURATION_MS)).toBeGreaterThanOrEqual(0);
    expect(normalizePhase(1e15, DEFAULT_DAY_DURATION_MS)).toBeLessThan(1);
  });

  test('puts the sun overhead at midday and below the horizon at midnight', () => {
    const noon = computeSunDirection(0.25);
    expect(noon.y).toBeGreaterThan(0.85);

    const midnight = computeSunDirection(0.75);
    expect(midnight.y).toBeLessThan(-0.85);

    const sunrise = computeSunDirection(0);
    expect(sunrise.x).toBeGreaterThan(0.8);

    const sunset = computeSunDirection(0.5);
    expect(sunset.x).toBeLessThan(-0.8);
  });

  test('returns a brighter sun at midday than at midnight', () => {
    const middayPhase = 0.25 * DEFAULT_DAY_DURATION_MS;
    const midnightPhase = 0.75 * DEFAULT_DAY_DURATION_MS;
    const midday = computeDayPhase(middayPhase);
    const midnight = computeDayPhase(midnightPhase);

    expect(midday.sunIntensity).toBeGreaterThan(midnight.sunIntensity * 4);
    expect(midday.hemisphereIntensity).toBeGreaterThan(midnight.hemisphereIntensity);
  });

  test('produces continuous palettes (no jumps between adjacent samples)', () => {
    const samples = 40;
    let prev = computeDayPhase(0);
    for (let i = 1; i <= samples; i += 1) {
      const t = (i / samples) * DEFAULT_DAY_DURATION_MS;
      const next = computeDayPhase(t);
      expect(Math.abs(next.sunIntensity - prev.sunIntensity)).toBeLessThan(0.6);
      expect(Math.abs(next.hemisphereIntensity - prev.hemisphereIntensity)).toBeLessThan(0.6);
      prev = next;
    }
  });

  test('returns deterministic palettes for the same timestamp', () => {
    const a = computeDayPhase(123_456_789);
    const b = computeDayPhase(123_456_789);
    expect(a).toEqual(b);
  });
});
