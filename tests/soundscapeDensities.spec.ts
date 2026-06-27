import { describe, expect, it } from 'vitest';
import { ambientDensities } from '../apps/client/src/audio/soundscape';

// The pure day↔night curve that drives the procedural soundscape: crickets at
// night, birds by day, wind always (brighter by day). Synthesis itself can't be
// unit-tested, but this mix curve is the audible behaviour that matters.

describe('ambientDensities', () => {
  it('full day → no crickets, some birds, brighter wind', () => {
    const d = ambientDensities(0);
    expect(d.cricket).toBe(0);
    expect(d.bird).toBeGreaterThan(0);
    expect(d.windLevel).toBeGreaterThan(0.9);
  });

  it('full night → crickets peak, no birds, calmer wind', () => {
    const d = ambientDensities(1);
    expect(d.cricket).toBeCloseTo(1);
    expect(d.bird).toBe(0);
    expect(d.windLevel).toBeCloseTo(0.6);
  });

  it('crickets stay silent until after dusk (~0.25), then ramp in', () => {
    expect(ambientDensities(0.2).cricket).toBe(0);
    expect(ambientDensities(0.25).cricket).toBe(0);
    expect(ambientDensities(0.6).cricket).toBeGreaterThan(0);
    expect(ambientDensities(0.9).cricket).toBeGreaterThan(ambientDensities(0.6).cricket);
  });

  it('clamps out-of-range night factors', () => {
    expect(ambientDensities(-1).cricket).toBe(0);
    expect(ambientDensities(2).cricket).toBeCloseTo(1);
  });
});
