import { describe, expect, it } from 'vitest';
import { enemyLevelTone } from '../apps/client/src/hud/PlatePanels';

/**
 * PR 631 — TargetPanel tints the enemy's 'Level N' chip based on
 * enemy.level vs player.level with a ±2 fair-fight window:
 *   - enemy > player + 2 → 'high' (red, caution)
 *   - enemy < player - 2 → 'low' (grey, trivial)
 *   - else → 'fair' (amber, normal fight)
 *
 * Pins boundary inclusivity (+2 and -2 are still 'fair') so a future
 * tweak to the threshold can't silently mis-paint a deadly enemy as
 * a fair fight (or vice-versa).
 */

describe('enemyLevelTone', () => {
  it("'fair' when same level", () => {
    expect(enemyLevelTone(5, 5)).toBe('fair');
  });

  it("'fair' at +2 (inclusive)", () => {
    expect(enemyLevelTone(5, 7)).toBe('fair');
  });

  it("'high' at +3 (just past the fair band)", () => {
    expect(enemyLevelTone(5, 8)).toBe('high');
  });

  it("'fair' at -2 (inclusive)", () => {
    expect(enemyLevelTone(5, 3)).toBe('fair');
  });

  it("'low' at -3 (just past the fair band)", () => {
    expect(enemyLevelTone(5, 2)).toBe('low');
  });

  it("'high' for extreme overlevel", () => {
    expect(enemyLevelTone(1, 50)).toBe('high');
  });

  it("'low' for extreme underlevel", () => {
    expect(enemyLevelTone(50, 1)).toBe('low');
  });
});
