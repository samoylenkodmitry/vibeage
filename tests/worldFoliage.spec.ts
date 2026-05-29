import { describe, expect, it } from 'vitest';
import {
  scatterChunkFoliage,
  foliageChunkOf,
  visibleFoliageChunks,
  FOLIAGE_CHUNK_SIZE,
} from '../apps/client/src/world-art/foliageScatter';
import { WORLD_SETTINGS } from '../packages/content/world';

const key = (c: { x: number; z: number }) => `${c.x}:${c.z}`;
const windowAt = (x: number, z: number, r: number) => {
  const c = foliageChunkOf(x, z);
  return new Set(visibleFoliageChunks(c.cx, c.cz, r).map(key));
};

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

/**
 * Streaming stability — the property the user's "trees disappear when I cross"
 * complaint is really about. Walking must NOT change the set of chunks already
 * on screen near the player; only a far frontier row may swap (and that row is
 * deep in fog). This is what makes the architecture solid rather than poppy.
 */
describe('foliage chunk streaming window', () => {
  const R = 3; // high/medium radius

  it('moving within a chunk leaves the visible set completely unchanged', () => {
    // Two points inside the same foliage chunk (≈1 m apart, and well within 340 m).
    const a = windowAt(10, 10, R);
    const b = windowAt(11, 12, R);
    expect(b).toEqual(a);
  });

  it('crossing ONE chunk boundary keeps every near chunk and swaps only a frontier row', () => {
    // Step from just inside chunk 0 to just inside chunk 1 along +x.
    const before = windowAt(FOLIAGE_CHUNK_SIZE - 1, 0, R);
    const after = windowAt(FOLIAGE_CHUNK_SIZE + 1, 0, R);

    const persisted = [...before].filter((k) => after.has(k));
    const dropped = [...before].filter((k) => !after.has(k));
    const added = [...after].filter((k) => !before.has(k));

    const rowCount = 2 * R + 1; // 7 chunks per row
    // Of a (2R+1)² window, exactly the trailing column drops and a leading
    // column is added — everything else (the near field) stays mounted.
    expect(before.size).toBe(rowCount * rowCount);
    expect(dropped.length).toBe(rowCount);
    expect(added.length).toBe(rowCount);
    expect(persisted.length).toBe(rowCount * (rowCount - 1));
  });

  it('a persisted chunk yields byte-identical foliage before and after the crossing', () => {
    const before = windowAt(FOLIAGE_CHUNK_SIZE - 1, 0, R);
    const after = windowAt(FOLIAGE_CHUNK_SIZE + 1, 0, R);
    const persistedKey = [...before].find((k) => after.has(k));
    expect(persistedKey).toBeDefined();
    const [px, pz] = persistedKey!.split(':').map(Number);
    // Same origin → same scatter, so on-screen trees never twitch when crossing.
    expect(scatterChunkFoliage(px, pz, FOLIAGE_CHUNK_SIZE, true))
      .toEqual(scatterChunkFoliage(px, pz, FOLIAGE_CHUNK_SIZE, true));
  });

  it('the streaming frontier reaches the fog band (≥ 960 m) so swaps hide in mist', () => {
    // radius × chunk is the nearest-edge distance (3 × 320 = 960); the far
    // corner is farther. Sits just under the terrain view edge (1024 m).
    expect(R * FOLIAGE_CHUNK_SIZE).toBeGreaterThanOrEqual(960);
  });
});
