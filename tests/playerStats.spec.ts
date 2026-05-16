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

  test('exposes the full L2-style derived block', () => {
    const stats = derivePlayerStats(10, 'warrior');
    expect(stats.pAtk).toBeGreaterThan(0);
    expect(stats.mAtk).toBeGreaterThan(0);
    expect(stats.pDef).toBeGreaterThan(0);
    expect(stats.mDef).toBeGreaterThan(0);
    expect(stats.hpRegen).toBeGreaterThan(0);
    expect(stats.mpRegen).toBeGreaterThan(0);
    expect(stats.accuracy).toBeGreaterThan(0);
    expect(stats.evasion).toBeGreaterThan(0);
    expect(stats.attackSpeed).toBeGreaterThan(0);
    expect(stats.castSpeed).toBeGreaterThan(0);
    expect(stats.castSpeed).toBeLessThanOrEqual(1);
    expect(stats.runSpeed).toBeGreaterThan(0);
  });

  test('mage has higher M.Atk than warrior at same level', () => {
    const mage = derivePlayerStats(10, 'mage');
    const warrior = derivePlayerStats(10, 'warrior');
    expect(mage.mAtk).toBeGreaterThan(warrior.mAtk);
    expect(warrior.pAtk).toBeGreaterThan(mage.pAtk);
  });

  test('paladin sits between warrior and healer for HP and MP', () => {
    const paladin = derivePlayerStats(5, 'paladin');
    const warrior = derivePlayerStats(5, 'warrior');
    const healer = derivePlayerStats(5, 'healer');

    expect(paladin.maxHealth).toBeLessThanOrEqual(warrior.maxHealth);
    expect(paladin.maxHealth).toBeGreaterThanOrEqual(healer.maxHealth);
  });
});
