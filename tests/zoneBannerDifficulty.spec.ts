import { describe, expect, it } from 'vitest';
import { difficultyFor } from '../apps/client/src/hud/ZoneBanner';

/**
 * PR 624 — ZoneBanner colours its border based on player level vs
 * the zone's recommended [minLevel, maxLevel] range:
 *   - player.level <  minLevel → 'high' (red, caution)
 *   - player.level ∈ [min..max] → 'fair' (green, suitable)
 *   - player.level >  maxLevel → 'low' (grey, no threat)
 *
 * Both ends of the 'fair' band are inclusive. These tests freeze
 * the boundary so a future tweak to the predicate can't silently
 * paint a green border on a deadly zone (or vice-versa).
 */

describe('difficultyFor', () => {
  it("'high' when player is below minLevel (one under)", () => {
    expect(difficultyFor(2, 3, 5)).toBe('high');
  });

  it("'high' at extreme underlevelling", () => {
    expect(difficultyFor(1, 10, 20)).toBe('high');
  });

  it("'fair' at the minLevel boundary (inclusive)", () => {
    expect(difficultyFor(3, 3, 5)).toBe('fair');
  });

  it("'fair' in the middle of the band", () => {
    expect(difficultyFor(4, 3, 5)).toBe('fair');
  });

  it("'fair' at the maxLevel boundary (inclusive)", () => {
    expect(difficultyFor(5, 3, 5)).toBe('fair');
  });

  it("'low' when player is above maxLevel (one over)", () => {
    expect(difficultyFor(6, 3, 5)).toBe('low');
  });

  it("'low' at extreme overlevelling", () => {
    expect(difficultyFor(50, 1, 3)).toBe('low');
  });

  it('handles single-level zones (min === max)', () => {
    expect(difficultyFor(3, 3, 3)).toBe('fair');
    expect(difficultyFor(2, 3, 3)).toBe('high');
    expect(difficultyFor(4, 3, 3)).toBe('low');
  });
});
