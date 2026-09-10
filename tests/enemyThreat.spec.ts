import { describe, expect, it } from 'vitest';
import { enemyThreat, threatNameplateStyle } from '../apps/client/src/enemyThreat';

/**
 * Con-colours on world nameplates.
 *
 * Every living enemy used to be painted the same red, so the only way to learn
 * whether the mob in front of you would kill you was to click it and read the
 * target panel. These bands are what replaces that click, which makes their
 * boundaries worth pinning: a mob mis-painted one band too safe is a death.
 */
describe('enemyThreat', () => {
  it('reads an even fight across the ±2 grind band', () => {
    for (const enemyLevel of [8, 9, 10, 11, 12]) {
      expect(enemyThreat(10, enemyLevel)).toBe('fair');
    }
  });

  it('steps up through high and deadly as the gap widens', () => {
    expect(enemyThreat(10, 13)).toBe('high');
    expect(enemyThreat(10, 15)).toBe('high');
    expect(enemyThreat(10, 16)).toBe('deadly');
    expect(enemyThreat(1, 50)).toBe('deadly');
  });

  it('steps down through low and trivial as the mob falls behind', () => {
    expect(enemyThreat(10, 7)).toBe('low');
    expect(enemyThreat(10, 5)).toBe('low');
    expect(enemyThreat(10, 4)).toBe('trivial');
    expect(enemyThreat(50, 1)).toBe('trivial');
  });

  it('never paints an unknown level as dangerous', () => {
    // A partial snapshot can arrive with no level yet; guessing "deadly" there
    // would scare a player off a harmless mob.
    expect(enemyThreat(10, 0)).toBe('fair');
    expect(enemyThreat(10, Number.NaN)).toBe('fair');
    expect(enemyThreat(Number.NaN, 10)).toBe('fair');
  });
});

describe('threatNameplateStyle', () => {
  it('marks only a genuine threat, and quiets what is beneath you', () => {
    expect(threatNameplateStyle('deadly', false).prefix).toBe('☠ ');
    expect(threatNameplateStyle('fair', false).prefix).toBe('');
    // Trivial mobs shrink so a cleared zone stops shouting for attention.
    expect(threatNameplateStyle('trivial', false).height)
      .toBeLessThan(threatNameplateStyle('fair', false).height);
  });

  it('keeps a mini-boss plate larger at every threat level', () => {
    for (const threat of ['trivial', 'low', 'fair', 'high', 'deadly'] as const) {
      expect(threatNameplateStyle(threat, true).height)
        .toBeGreaterThan(threatNameplateStyle(threat, false).height);
      // …while still carrying the threat colour: the crown says "boss", the
      // colour answers the more useful "can it kill me?".
      expect(threatNameplateStyle(threat, true).color)
        .toBe(threatNameplateStyle(threat, false).color);
    }
  });
});
