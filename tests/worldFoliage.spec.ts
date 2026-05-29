import { describe, expect, it } from 'vitest';
import { scatterChunkFoliage } from '../apps/client/src/world-art/foliageScatter';
import { WORLD_SETTINGS } from '../packages/content/world';

/**
 * The whole point of the rewrite: foliage is POSITION-STABLE. A chunk's
 * contents are a pure function of its origin — never of the player's
 * position — so walking away and back shows the identical scene and
 * crossing a line never re-shuffles already-visible trees. (The old
 * FoliageField centred a window on a quantised, jumping point and scaled
 * density by distance to it, which is exactly what these pin against.)
 */
const CHUNK = WORLD_SETTINGS.terrainChunkSize;

function totalCount(f: ReturnType<typeof scatterChunkFoliage>): number {
  return f.trees.length + f.conifers.length + f.grass.length + f.accents.length;
}

describe('chunk foliage scatter', () => {
  it('is deterministic — same chunk origin yields an identical set every call', () => {
    const a = scatterChunkFoliage(512, -256, CHUNK, true);
    const b = scatterChunkFoliage(512, -256, CHUNK, true);
    expect(b.trees).toEqual(a.trees);
    expect(b.conifers).toEqual(a.conifers);
    expect(b.grass).toEqual(a.grass);
    expect(b.accents).toEqual(a.accents);
  });

  it('a given chunk is independent of any "player position" — only its origin matters', () => {
    // Re-deriving the same chunk (as happens when the player leaves and
    // returns) must reproduce the exact same instances.
    const first = scatterChunkFoliage(0, 0, CHUNK, true);
    // ...generate a far-away chunk in between (simulating travel)...
    scatterChunkFoliage(4096, 4096, CHUNK, true);
    const back = scatterChunkFoliage(0, 0, CHUNK, true);
    expect(back.trees).toEqual(first.trees);
  });

  it('every instance sits inside its chunk bounds', () => {
    const ox = 256, oz = 768;
    const f = scatterChunkFoliage(ox, oz, CHUNK, true);
    for (const inst of [...f.trees, ...f.conifers, ...f.grass, ...f.accents]) {
      expect(inst.x).toBeGreaterThanOrEqual(ox - CHUNK * 0.3);
      expect(inst.x).toBeLessThanOrEqual(ox + CHUNK * 1.3);
      expect(inst.z).toBeGreaterThanOrEqual(oz - CHUNK * 0.3);
      expect(inst.z).toBeLessThanOrEqual(oz + CHUNK * 1.3);
    }
  });

  it('low quality (grassOn=false) drops the grass layer but keeps trees', () => {
    const withGrass = scatterChunkFoliage(0, 0, CHUNK, true);
    const noGrass = scatterChunkFoliage(0, 0, CHUNK, false);
    expect(noGrass.grass.length).toBe(0);
    expect(noGrass.trees).toEqual(withGrass.trees);
    expect(totalCount(withGrass)).toBeGreaterThan(0);
  });
});
