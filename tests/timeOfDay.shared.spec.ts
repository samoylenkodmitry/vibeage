import { describe, expect, test } from 'vitest';
import {
  DEFAULT_DAY_DURATION_MS,
  dayPhaseLabel,
  isMobAllowedInPhase,
  normalizePhase,
} from '../packages/sim/timeOfDay';

describe('shared time of day', () => {
  test('normalizePhase wraps around the day cycle', () => {
    expect(normalizePhase(0)).toBe(0);
    expect(normalizePhase(DEFAULT_DAY_DURATION_MS / 2)).toBeCloseTo(0.5);
    expect(normalizePhase(DEFAULT_DAY_DURATION_MS)).toBe(0);
    expect(normalizePhase(DEFAULT_DAY_DURATION_MS * 3.25)).toBeCloseTo(0.25);
  });

  test('dayPhaseLabel returns the bucket each phase falls into', () => {
    expect(dayPhaseLabel(DEFAULT_DAY_DURATION_MS * 0.05)).toBe('dawn');
    expect(dayPhaseLabel(DEFAULT_DAY_DURATION_MS * 0.3)).toBe('day');
    expect(dayPhaseLabel(DEFAULT_DAY_DURATION_MS * 0.7)).toBe('dusk');
    expect(dayPhaseLabel(DEFAULT_DAY_DURATION_MS * 0.9)).toBe('night');
  });

  test('isMobAllowedInPhase defaults to always allowed when no filter is set', () => {
    expect(isMobAllowedInPhase(undefined, 'day')).toBe(true);
    expect(isMobAllowedInPhase([], 'night')).toBe(true);
  });

  test('isMobAllowedInPhase honours an explicit list', () => {
    expect(isMobAllowedInPhase(['dusk', 'night'], 'night')).toBe(true);
    expect(isMobAllowedInPhase(['dusk', 'night'], 'day')).toBe(false);
  });
});
