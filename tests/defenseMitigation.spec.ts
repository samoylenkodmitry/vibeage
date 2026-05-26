import { describe, expect, it } from 'vitest';
import { mitigatedDamage } from '../packages/sim/combatMath';
import { DEFENSE_HALF_REDUCTION } from '../packages/content/stats';
import { applyEnemyAttack } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { PlayerState } from '../packages/sim/entities';

/**
 * P.Def / M.Def used to be dead stats — computed, shown, gear-scaled,
 * but read by no combat code. `mitigatedDamage` is the shared curve;
 * the damage pipeline applies it by attack kind so defense finally
 * reduces incoming damage.
 */

describe('mitigatedDamage curve', () => {
  it('no defense → full damage', () => {
    expect(mitigatedDamage(100, 0)).toBe(100);
    expect(mitigatedDamage(100, -50)).toBe(100); // negative clamps to 0
  });
  it('defense == K halves the damage', () => {
    expect(mitigatedDamage(100, DEFENSE_HALF_REDUCTION)).toBeCloseTo(50, 5);
  });
  it('diminishing returns — never zeroes a hit', () => {
    const huge = mitigatedDamage(100, DEFENSE_HALF_REDUCTION * 99); // 1% gets through
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeCloseTo(1, 1);
  });
  it('penetration lowers the target effective defense', () => {
    const full = mitigatedDamage(100, DEFENSE_HALF_REDUCTION);
    const pierced = mitigatedDamage(100, DEFENSE_HALF_REDUCTION, DEFENSE_HALF_REDUCTION); // fully pierced
    expect(pierced).toBe(100);
    expect(pierced).toBeGreaterThan(full);
  });
});

const NOW = 1_700_000_000_000;

function makePlayer(pDef: number | undefined): PlayerState {
  return {
    id: 'p1', socketId: 's', name: 'p1',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100_000, maxHealth: 100_000, mana: 0, maxMana: 0,
    className: 'knight', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 1, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    ...(pDef === undefined ? {} : { stats: { pDef } }),
  };
}

describe('P.Def reduces incoming mob damage', () => {
  function readyEnemy() {
    const enemy = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, NOW);
    enemy.id = 'goblin-test';
    enemy.attackDamage = 200;
    enemy.attackCooldownMs = 1_000;
    enemy.lastAttackTime = 0;
    enemy.accuracy = 10_000; // never dodged — isolate mitigation
    return enemy;
  }

  it('a player with P.Def takes less than one with none', () => {
    const armored = applyEnemyAttack(readyEnemy(), makePlayer(DEFENSE_HALF_REDUCTION), NOW)!;
    const unarmored = applyEnemyAttack(readyEnemy(), makePlayer(undefined), NOW)!;
    expect(unarmored.damage).toBe(200);            // no defense → full
    expect(armored.damage).toBeCloseTo(100, 0);    // P.Def == K → half
    expect(armored.damage).toBeLessThan(unarmored.damage);
  });
});
