import { describe, it, expect } from 'vitest';
import { scatterGrass, GRASS_CHUNK } from '../apps/client/src/WorldGrassField';

describe('WorldGrassField scatter', () => {
  it('is position-stable: same chunk origin yields an identical blade set', () => {
    const a = scatterGrass(0, 0);
    const b = scatterGrass(0, 0);
    expect(b).toEqual(a);
  });

  it('different chunk origins yield different blades', () => {
    const a = scatterGrass(0, 0);
    const b = scatterGrass(GRASS_CHUNK, 0);
    // Not the same placements (overwhelmingly likely with a position-seeded RNG).
    expect(a).not.toEqual(b);
  });

  it('produces a dense carpet where grass grows — many blades per 24 m chunk', () => {
    // Spawn meadow is grassy; the fine grid + density boost must yield a carpet,
    // not the old one-tuft-per-1000 m² sliver.
    const blades = scatterGrass(0, 0);
    expect(blades.length).toBeGreaterThan(80);
  });

  it('keeps every blade inside its chunk footprint (+ sub-cell jitter)', () => {
    const blades = scatterGrass(0, 0);
    for (const b of blades) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThan(GRASS_CHUNK + 1);
      expect(b.z).toBeGreaterThanOrEqual(0);
      expect(b.z).toBeLessThan(GRASS_CHUNK + 1);
      expect(b.scale).toBeGreaterThan(0);
    }
  });
});
