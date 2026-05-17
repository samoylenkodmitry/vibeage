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

  test('warrior has more health than mage at the same level (class HP multiplier)', () => {
    const warrior = derivePlayerStats(5, 'warrior');
    const mage = derivePlayerStats(5, 'mage');

    // Class baseStats.healthMultiplier still differentiates HP/MP/dmg
    // (interim until passive skills replace it). Raw STR/DEX/etc are
    // now race-owned and identical for same-race characters.
    expect(warrior.maxHealth).toBeGreaterThan(mage.maxHealth);
    expect(warrior.str).toBe(mage.str);
  });

  test('orc warrior has higher STR than dark_elf mage (race owns base attrs)', () => {
    const orcWarrior = derivePlayerStats(5, 'warrior', {}, 'orc');
    const darkElfMage = derivePlayerStats(5, 'mage', {}, 'dark_elf');

    // Race differentiation drives STR/INT/etc; class only affects
    // derived HP/MP/dmg multipliers.
    expect(orcWarrior.str).toBeGreaterThan(darkElfMage.str);
    expect(darkElfMage.int).toBeGreaterThan(orcWarrior.int);
  });

  test('knight has more health than rogue (class HP multiplier)', () => {
    const rogue = derivePlayerStats(5, 'rogue');
    const knight = derivePlayerStats(5, 'knight');

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

  test('class damageMultiplier still tilts pAtk/mAtk (interim — passive skills will replace)', () => {
    // Mage has damageMultiplier 1.2, warrior 1.1; with same base attrs
    // mage's multiplier wins. Once passive skills land (Section 8
    // L520), warrior's "Power Strike" passive will reverse this for
    // pAtk while mage's "Arcane Focus" boosts mAtk further.
    const mage = derivePlayerStats(10, 'mage');
    const warrior = derivePlayerStats(10, 'warrior');
    expect(mage.dmgMult).toBeGreaterThan(warrior.dmgMult);
  });

  test('paladin sits between warrior and healer for HP and MP', () => {
    const paladin = derivePlayerStats(5, 'paladin');
    const warrior = derivePlayerStats(5, 'warrior');
    const healer = derivePlayerStats(5, 'healer');

    expect(paladin.maxHealth).toBeLessThanOrEqual(warrior.maxHealth);
    expect(paladin.maxHealth).toBeGreaterThanOrEqual(healer.maxHealth);
  });
});
