import { describe, expect, test } from 'vitest';
import { RACE_PROFILES, CHARACTER_RACES, DEFAULT_RACE } from '../packages/content/races';
import { derivePlayerStats } from '../packages/sim/playerStats';

describe('race profiles', () => {
  test('every race exposes a complete stat multiplier block', () => {
    for (const race of CHARACTER_RACES) {
      const profile = RACE_PROFILES[race];
      expect(profile).toBeDefined();
      expect(profile.statMultipliers.str).toBeGreaterThan(0);
      expect(profile.statMultipliers.dex).toBeGreaterThan(0);
      expect(profile.statMultipliers.con).toBeGreaterThan(0);
      expect(profile.statMultipliers.int).toBeGreaterThan(0);
      expect(profile.statMultipliers.wit).toBeGreaterThan(0);
      expect(profile.statMultipliers.men).toBeGreaterThan(0);
    }
  });

  test('human is the neutral default', () => {
    expect(DEFAULT_RACE).toBe('human');
    const human = RACE_PROFILES.human.statMultipliers;
    expect(human.str).toBe(1.0);
    expect(human.men).toBe(1.0);
  });
});

describe('derivePlayerStats × race', () => {
  test('orc warrior has more STR than human warrior at the same level', () => {
    const orc = derivePlayerStats(10, 'warrior', {}, 'orc');
    const human = derivePlayerStats(10, 'warrior', {}, 'human');
    expect(orc.str).toBeGreaterThan(human.str);
    expect(orc.maxHealth).toBeGreaterThanOrEqual(human.maxHealth);
  });

  test('elf mage has higher wit than human mage', () => {
    const elf = derivePlayerStats(10, 'mage', {}, 'elf');
    const human = derivePlayerStats(10, 'mage', {}, 'human');
    expect(elf.wit).toBeGreaterThan(human.wit);
  });

  test('dwarf has more constitution than dark elf at the same level', () => {
    const dwarf = derivePlayerStats(10, 'warrior', {}, 'dwarf');
    const darkElf = derivePlayerStats(10, 'warrior', {}, 'dark_elf');
    expect(dwarf.con).toBeGreaterThan(darkElf.con);
  });

  test('omitting the race argument behaves like passing human', () => {
    const defaultDerived = derivePlayerStats(5, 'mage');
    const humanDerived = derivePlayerStats(5, 'mage', {}, 'human');
    expect(defaultDerived).toEqual(humanDerived);
  });
});
