import { describe, expect, it } from 'vitest';
import { LUSH_VALE, GLACIAL_VALE, LUSH_VALE_WATER_Y, getTerrainHeight } from '../packages/content/terrain';
import {
  SURFACES,
  footstepLayers,
  gustLayers,
  lapLayers,
  placeProfileAt,
  shorelineAt,
  surfaceAt,
  waterLevelAt,
} from '../apps/client/src/audio/surfaces';

/**
 * Footsteps and sense-of-place read the same terrain functions the ground mesh
 * is built from, so what you hear can't drift from what you see. These lock down
 * the audible consequences: spawn meadow ≠ the alpine vale, a canyon isn't as
 * open as a field, and standing in water splashes.
 */

describe('surfaceAt', () => {
  it('is grass in the flat meadow around spawn', () => {
    expect(surfaceAt(0, 0)).toBe('grass');
    expect(surfaceAt(120, -60)).toBe('grass');
  });

  it('walks the Glacial Vale on snow, and into the tarn on water', () => {
    const found = new Set<string>();
    for (let dx = -400; dx <= 400; dx += 80) {
      for (let dz = -400; dz <= 400; dz += 80) {
        found.add(surfaceAt(GLACIAL_VALE.x + dx, GLACIAL_VALE.z + dz));
      }
    }
    // The alpine floor and its meltwater must both be reachable underfoot —
    // the vale is the clearest case of "here does not sound like spawn".
    expect(found.has('snow')).toBe(true);
    expect(found.has('water')).toBe(true);
    expect(found.has('grass')).toBe(false);
  });

  it('splashes where the ground sits below the vale river', () => {
    const x = LUSH_VALE.x;
    const z = LUSH_VALE.z;
    if (getTerrainHeight(x, z) < LUSH_VALE_WATER_Y - 1) expect(surfaceAt(x, z)).toBe('water');
    else expect(waterLevelAt(x, z)).toBe(LUSH_VALE_WATER_Y);
  });

  it('never reads a dry canyon floor as water — no water plane reaches it', () => {
    // Deep terrain far from any lake/vale must have no water level at all,
    // otherwise a gorge would splash underfoot.
    for (const [x, z] of [[-4_000, 2_500], [9_000, -6_500], [15_000, 15_000]]) {
      if (waterLevelAt(x, z) === null) expect(surfaceAt(x, z)).not.toBe('water');
    }
  });
});

describe('footstepLayers', () => {
  it('gives every surface a playable, quiet layer', () => {
    for (const surface of SURFACES) {
      const [layer] = footstepLayers(surface, 0);
      expect(layer.urls.length).toBeGreaterThan(0);
      expect(layer.gain).toBeGreaterThan(0);
      // Feet are the most-heard sound in a session; anything with presence
      // becomes a metronome. Keep them well under a combat hit (0.85).
      expect(layer.gain).toBeLessThan(0.3);
    }
  });

  it('alternates pitch per foot and leans on effort for gain', () => {
    const left = footstepLayers('grass', 1)[0];
    const right = footstepLayers('grass', -1)[0];
    expect(left.rate).not.toBeCloseTo(right.rate ?? 1);
    expect(footstepLayers('grass', 0, 1)[0].gain).toBeGreaterThan(footstepLayers('grass', 0, 0)[0].gain ?? 0);
  });

  it('clamps a wild variance/effort rather than producing a chipmunk step', () => {
    const wild = footstepLayers('stone', 12, 9)[0];
    const sane = footstepLayers('stone', 1, 1)[0];
    expect(wild.rate).toBeCloseTo(sane.rate ?? 1);
    expect(wild.gain).toBeCloseTo(sane.gain ?? 1);
  });
});

describe('placeProfileAt', () => {
  it('makes the meadow and the high ground sound different', () => {
    const meadow = placeProfileAt(0, 0);
    // Somewhere genuinely high: scan out until the terrain climbs.
    let ridge = meadow;
    for (let d = 1_000; d <= 20_000; d += 500) {
      if (getTerrainHeight(d, d) > 40) { ridge = placeProfileAt(d, d); break; }
    }
    expect(ridge.gust).toBeGreaterThan(0);
    expect(ridge.lowpassHz).toBeLessThanOrEqual(meadow.lowpassHz);
  });

  it('keeps every biome profile in a sane, non-shrill range', () => {
    for (let d = 0; d < 60_000; d += 2_137) {
      const p = placeProfileAt(d, -d * 0.7);
      expect(p.level).toBeGreaterThan(0);
      expect(p.level).toBeLessThanOrEqual(1.2);
      expect(p.lowpassHz).toBeGreaterThan(1_000);
      expect(p.gust).toBeGreaterThanOrEqual(0);
      expect(p.gust).toBeLessThanOrEqual(1.6);
    }
  });
});

describe('gust & lap voices', () => {
  it('are quiet and pitched right down — wind and water, not engine and slime', () => {
    const gust = gustLayers(1)[0];
    expect(gust.gain).toBeLessThan(0.15);
    expect(gust.rate).toBeLessThan(0.5);
    const lap = lapLayers(1)[0];
    expect(lap.gain).toBeLessThan(0.2);
    expect(lap.rate).toBeLessThan(0.6);
  });

  it('scales with strength and clamps out-of-range input', () => {
    expect(gustLayers(1).at(0)?.gain).toBeGreaterThan(gustLayers(0).at(0)?.gain ?? 1);
    expect(gustLayers(99).at(0)?.gain).toBeCloseTo(gustLayers(1.6).at(0)?.gain ?? 0);
    expect(lapLayers(-5).at(0)?.gain).toBeCloseTo(lapLayers(0).at(0)?.gain ?? 1);
  });
});

describe('shorelineAt', () => {
  it('is zero where there is no water body at all', () => {
    expect(shorelineAt(0, 0)).toBe(0);
  });

  it('is in [0,1] everywhere', () => {
    for (let d = 0; d < 40_000; d += 3_301) {
      const s = shorelineAt(d, d * 0.4);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
