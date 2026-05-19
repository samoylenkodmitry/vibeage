import { describe, expect, test } from 'vitest';
import { RACE_PROFILES, CHARACTER_RACES, DEFAULT_RACE, type CharacterRace } from '../packages/content/races';
import type { CharacterClass } from '../packages/content/classes';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
} from '../packages/sim/statContributions';

function computeForRace(level: number, className: CharacterClass, race: CharacterRace) {
  const view: StatPlayerView = { level, className, race };
  return computeAllStats(buildContributions(view), { level, className, race, health: 100, maxHealth: 100 }).totals;
}

describe('race profiles', () => {
  test('every race exposes a complete stat block', () => {
    for (const race of CHARACTER_RACES) {
      const profile = RACE_PROFILES[race];
      expect(profile).toBeDefined();
      expect(profile.baseAttrs.str).toBeGreaterThan(0);
      expect(profile.baseAttrs.dex).toBeGreaterThan(0);
      expect(profile.baseAttrs.con).toBeGreaterThan(0);
      expect(profile.baseAttrs.int).toBeGreaterThan(0);
      expect(profile.baseAttrs.wit).toBeGreaterThan(0);
      expect(profile.baseAttrs.men).toBeGreaterThan(0);
    }
  });

  test('human is the neutral default', () => {
    expect(DEFAULT_RACE).toBe('human');
    const human = RACE_PROFILES.human.baseAttrs;
    expect(human.str).toBe(13);
    expect(human.men).toBe(13);
  });
});

describe('Contribution stats × race', () => {
  test('orc warrior has more STR than human warrior at the same level', () => {
    const orc = computeForRace(10, 'warrior', 'orc');
    const human = computeForRace(10, 'warrior', 'human');
    expect(orc.str).toBeGreaterThan(human.str);
    expect(orc.maxHealth).toBeGreaterThanOrEqual(human.maxHealth);
  });

  test('elf mage has higher wit than human mage', () => {
    const elf = computeForRace(10, 'mage', 'elf');
    const human = computeForRace(10, 'mage', 'human');
    expect(elf.wit).toBeGreaterThan(human.wit);
  });

  test('dwarf has more constitution than dark elf at the same level', () => {
    const dwarf = computeForRace(10, 'warrior', 'dwarf');
    const darkElf = computeForRace(10, 'warrior', 'dark_elf');
    expect(dwarf.con).toBeGreaterThan(darkElf.con);
  });

  test('omitting the race argument behaves like passing human', () => {
    const view: StatPlayerView = { level: 5, className: 'mage' };
    const human: StatPlayerView = { level: 5, className: 'mage', race: 'human' };
    const a = computeAllStats(buildContributions(view), { level: 5, className: 'mage', race: 'human', health: 1, maxHealth: 1 }).totals;
    const b = computeAllStats(buildContributions(human), { level: 5, className: 'mage', race: 'human', health: 1, maxHealth: 1 }).totals;
    expect(a).toEqual(b);
  });
});
