import { describe, expect, it } from 'vitest';
import { phaseToSlice } from '../apps/client/src/hud/TimeOfDayChip';

/**
 * PR 619 — TimeOfDayChip maps the 0..1 day phase to one of four
 * friendly slices (Dawn / Day / Dusk / Night). Boundaries are
 * intentionally wide so a phase wobbling around the cusp doesn't
 * flicker. These tests pin the boundary values directly so a
 * future tweak to the KEYFRAMES in timeOfDay.ts doesn't silently
 * rename what the player sees.
 */

describe('phaseToSlice', () => {
  it('reads 0.00 as Dawn (start of cycle)', () => {
    expect(phaseToSlice(0).label).toBe('Dawn');
  });

  it('reads 0.17 as Dawn (just before dawn → day cusp)', () => {
    expect(phaseToSlice(0.17).label).toBe('Dawn');
  });

  it('reads 0.18 as Day (dawn → day cusp)', () => {
    expect(phaseToSlice(0.18).label).toBe('Day');
  });

  it('reads 0.5 as Day (midday)', () => {
    expect(phaseToSlice(0.5).label).toBe('Day');
  });

  it('reads 0.62 as Dusk (day → dusk cusp)', () => {
    expect(phaseToSlice(0.62).label).toBe('Dusk');
  });

  it('reads 0.82 as Night (dusk → night cusp)', () => {
    expect(phaseToSlice(0.82).label).toBe('Night');
  });

  it('reads 0.99 as Night (just before wrap)', () => {
    expect(phaseToSlice(0.99).label).toBe('Night');
  });

  it('each slice carries an icon', () => {
    for (const phase of [0, 0.3, 0.7, 0.9]) {
      expect(phaseToSlice(phase).icon.length).toBeGreaterThan(0);
    }
  });
});
