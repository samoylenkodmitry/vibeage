import { describe, expect, it } from 'vitest';
import { EFFECTS, type EffectId } from '../packages/sim/effects.js';

describe('effect definitions', () => {
  it('exports the current effect ids', () => {
    expect(Object.keys(EFFECTS).sort()).toEqual(['bleed', 'burn', 'regen']);
  });

  it('applies deterministic ticks for the same seed', () => {
    const input = { level: 4, int: 3, seed: 12345 };

    for (const effectId of Object.keys(EFFECTS) as EffectId[]) {
      expect(EFFECTS[effectId].apply(input)).toEqual(EFFECTS[effectId].apply(input));
    }
  });

  it('keeps damage and healing effect types distinct', () => {
    const input = { level: 4, int: 3, seed: 12345 };

    expect(EFFECTS.burn.apply(input).type).toBe('damage');
    expect(EFFECTS.bleed.apply(input).type).toBe('damage');
    expect(EFFECTS.regen.apply(input).type).toBe('healing');
  });
});
