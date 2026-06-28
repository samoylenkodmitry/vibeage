import { describe, expect, it } from 'vitest';
import { ambientMix } from '../apps/client/src/audio/soundscape';

// The pure day↔night cross-fade that drives the ambient soundscape: the forest
// bed by day, crickets by night, both blended at dawn/dusk. The looped samples
// can't be unit-tested, but this mix curve is the audible behaviour that matters.

describe('ambientMix', () => {
  it('full day → forest bed up, crickets silent', () => {
    const m = ambientMix(0);
    expect(m.day).toBe(1);
    expect(m.night).toBe(0);
  });

  it('full night → crickets up, forest silent', () => {
    const m = ambientMix(1);
    expect(m.day).toBe(0);
    expect(m.night).toBe(1);
  });

  it('dawn/dusk blends both beds', () => {
    const m = ambientMix(0.5);
    expect(m.day).toBeCloseTo(0.5);
    expect(m.night).toBeCloseTo(0.5);
    expect(m.day + m.night).toBeCloseTo(1);
  });

  it('clamps out-of-range night factors', () => {
    expect(ambientMix(-1)).toEqual({ day: 1, night: 0 });
    expect(ambientMix(2)).toEqual({ day: 0, night: 1 });
  });
});
