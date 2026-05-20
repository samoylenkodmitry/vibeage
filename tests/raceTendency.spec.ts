import { describe, expect, it } from 'vitest';
import { CHARACTER_RACES, getRaceStatTendency, RACE_PROFILES } from '../packages/content/races';

/**
 * §49/M2 — race tendency summary for the lobby create form.
 * Verifies humans read as 'balanced' (their baseAttrs are flat)
 * and the punchy races (orc / dark_elf) call out their visible
 * strengths.
 */

describe('getRaceStatTendency', () => {
  it('flags human as balanced — every base stat is 13', () => {
    expect(RACE_PROFILES.human.baseAttrs).toEqual({ str: 13, dex: 13, con: 13, int: 13, wit: 13, men: 13 });
    expect(getRaceStatTendency('human').balanced).toBe(true);
  });
  it('orc is strong in STR + CON', () => {
    const t = getRaceStatTendency('orc');
    expect(t.balanced).toBe(false);
    expect(t.strong).toContain('str');
    expect(t.strong).toContain('con');
  });
  it('dark_elf strong in INT (their headline stat)', () => {
    const t = getRaceStatTendency('dark_elf');
    expect(t.strong).toContain('int');
  });
  it('returns a tendency object for every race', () => {
    for (const race of CHARACTER_RACES) {
      const t = getRaceStatTendency(race);
      expect(t, race).toBeDefined();
    }
  });
});
