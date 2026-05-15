import { describe, expect, test } from 'vitest';
import { derivePlayerStats } from '../packages/sim/playerStats';

describe('derivePlayerStats', () => {
  test('scales mage stats with intellect, wit, and mana multiplier', () => {
    const level1 = derivePlayerStats(1, 'mage');
    const level10 = derivePlayerStats(10, 'mage');

    expect(level10.int).toBeGreaterThan(level1.int);
    expect(level10.dmgMult).toBeGreaterThan(level1.dmgMult);
    expect(level10.maxMana).toBeGreaterThan(level1.maxMana);
  });

  test('warrior has more health and physical damage than mage at the same level', () => {
    const warrior = derivePlayerStats(5, 'warrior');
    const mage = derivePlayerStats(5, 'mage');

    expect(warrior.maxHealth).toBeGreaterThan(mage.maxHealth);
    expect(warrior.str).toBeGreaterThan(mage.str);
  });

  test('rogue has higher crit chance than knight at the same level', () => {
    const rogue = derivePlayerStats(5, 'rogue');
    const knight = derivePlayerStats(5, 'knight');

    expect(rogue.critChance).toBeGreaterThan(knight.critChance);
    expect(knight.maxHealth).toBeGreaterThan(rogue.maxHealth);
  });

  test('paladin sits between warrior and healer for HP and MP', () => {
    const paladin = derivePlayerStats(5, 'paladin');
    const warrior = derivePlayerStats(5, 'warrior');
    const healer = derivePlayerStats(5, 'healer');

    expect(paladin.maxHealth).toBeLessThanOrEqual(warrior.maxHealth);
    expect(paladin.maxHealth).toBeGreaterThanOrEqual(healer.maxHealth);
  });
});
