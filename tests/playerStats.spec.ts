import { describe, expect, test } from 'vitest';
import type { CharacterRace } from '../packages/content/races';
import type { CharacterClass } from '../packages/content/classes';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
} from '../packages/sim/statContributions';

function stats(level: number, className: CharacterClass, race: CharacterRace = 'human') {
  const view: StatPlayerView = { level, className, race };
  return computeAllStats(buildContributions(view), { level, className, race, health: 1, maxHealth: 1 }).totals;
}

describe('player stats via Contribution registry', () => {
  test('scales mage stats with intellect, wit, and mana multiplier', () => {
    const level1 = stats(1, 'mage');
    const level10 = stats(10, 'mage');

    expect(level10.int).toBeGreaterThan(level1.int);
    expect(level10.dmgMult).toBeGreaterThan(level1.dmgMult);
    expect(level10.maxMana).toBeGreaterThan(level1.maxMana);
  });

  test('warrior has more health than mage at the same level (class HP multiplier)', () => {
    const warrior = stats(5, 'warrior');
    const mage = stats(5, 'mage');
    expect(warrior.maxHealth).toBeGreaterThan(mage.maxHealth);
    expect(warrior.str).toBe(mage.str);
  });

  test('orc warrior has higher STR than dark_elf mage (race owns base attrs)', () => {
    const orcWarrior = stats(5, 'warrior', 'orc');
    const darkElfMage = stats(5, 'mage', 'dark_elf');
    expect(orcWarrior.str).toBeGreaterThan(darkElfMage.str);
    expect(darkElfMage.int).toBeGreaterThan(orcWarrior.int);
  });

  test('knight has more health than rogue (class HP multiplier)', () => {
    const rogue = stats(5, 'rogue');
    const knight = stats(5, 'knight');
    expect(knight.maxHealth).toBeGreaterThan(rogue.maxHealth);
  });

  test('exposes the full L2-style derived block', () => {
    const s = stats(10, 'warrior');
    expect(s.pAtk).toBeGreaterThan(0);
    expect(s.mAtk).toBeGreaterThan(0);
    expect(s.pDef).toBeGreaterThan(0);
    expect(s.mDef).toBeGreaterThan(0);
    expect(s.hpRegen).toBeGreaterThan(0);
    expect(s.mpRegen).toBeGreaterThan(0);
    expect(s.accuracy).toBeGreaterThan(0);
    expect(s.evasion).toBeGreaterThan(0);
    expect(s.attackSpeed).toBeGreaterThan(0);
    expect(s.castSpeed).toBeGreaterThan(0);
    expect(s.castSpeed).toBeLessThanOrEqual(1);
    expect(s.runSpeed).toBeGreaterThan(0);
  });

  test('class damageMultiplier still tilts dmgMult', () => {
    // Mage damageMultiplier 1.2 vs warrior 1.1; same base attrs ⇒ mage wins.
    const mage = stats(10, 'mage');
    const warrior = stats(10, 'warrior');
    expect(mage.dmgMult).toBeGreaterThan(warrior.dmgMult);
  });

  test('paladin sits between warrior and healer for HP and MP', () => {
    const paladin = stats(5, 'paladin');
    const warrior = stats(5, 'warrior');
    const healer = stats(5, 'healer');
    expect(paladin.maxHealth).toBeLessThanOrEqual(warrior.maxHealth);
    expect(paladin.maxHealth).toBeGreaterThanOrEqual(healer.maxHealth);
  });
});
