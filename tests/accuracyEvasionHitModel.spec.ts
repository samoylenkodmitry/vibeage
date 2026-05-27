import { describe, expect, it } from 'vitest';
import { computeMissChance } from '../packages/sim/combatMath';
import { ACCURACY_BASELINE, EVASION_BASELINE, MAX_DODGE_CHANCE } from '../packages/content/stats';
import { incomingMissChance } from '../server/combat/statusQueries';
import { applyEnemyAttack } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { PlayerState } from '../packages/sim/entities';

/**
 * The base accuracy/evasion stats used to be inert — computed,
 * displayed, and buffed by passives, but read by nothing in combat.
 * `computeMissChance` opposes them against their baselines so they
 * finally bite, while keeping unbuffed combat at 0% miss (no balance
 * shift). Evade-style flat dodge buffs sum on top via
 * `incomingMissChance`.
 */

describe('computeMissChance — accuracy vs evasion', () => {
  it('is 0 at the baselines (no balance regression for unbuffed combat)', () => {
    expect(computeMissChance(ACCURACY_BASELINE, EVASION_BASELINE)).toBe(0);
  });

  it('is 0 whenever accuracy keeps pace with evasion', () => {
    // +20 evasion vs +20 accuracy → deltas cancel → no dodge.
    expect(computeMissChance(ACCURACY_BASELINE + 20, EVASION_BASELINE + 20)).toBe(0);
    // More accuracy than evasion → still 0 (never negative).
    expect(computeMissChance(ACCURACY_BASELINE + 50, EVASION_BASELINE + 10)).toBe(0);
  });

  it('each net evasion point above the attacker is +1% dodge', () => {
    // +25 evasion, baseline accuracy → 25% dodge.
    expect(computeMissChance(ACCURACY_BASELINE, EVASION_BASELINE + 25)).toBeCloseTo(0.25, 5);
    // Attacker accuracy claws some back: +25 evasion, +10 accuracy → 15%.
    expect(computeMissChance(ACCURACY_BASELINE + 10, EVASION_BASELINE + 25)).toBeCloseTo(0.15, 5);
  });

  it('caps at MAX_DODGE_CHANCE', () => {
    expect(computeMissChance(ACCURACY_BASELINE, EVASION_BASELINE + 1000)).toBe(MAX_DODGE_CHANCE);
  });

  it('treats a missing accuracy stat as the baseline (neutral attacker)', () => {
    expect(incomingMissChance(undefined, makeTarget(EVASION_BASELINE), Date.now())).toBe(0);
    expect(incomingMissChance(undefined, makeTarget(EVASION_BASELINE + 30), Date.now())).toBeCloseTo(0.30, 5);
  });
});

function makeTarget(evasion: number): PlayerState {
  return {
    id: 't', socketId: 's', name: 't',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 0, maxMana: 0,
    className: 'rogue', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 1, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    stats: { evasion },
  };
}

describe('base evasion stat dodges mob swings', () => {
  const SPAWN_TS = 1_700_000_000_000; // createEnemy's 4th arg is spawnTimeTs, not an id.
  function readyEnemy(accuracy?: number) {
    const enemy = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, SPAWN_TS);
    enemy.id = 'goblin-test';
    enemy.attackDamage = 100;
    enemy.attackCooldownMs = 1_000;
    enemy.lastAttackTime = 0;
    if (accuracy !== undefined) enemy.stats = { ...enemy.stats, accuracy };
    return enemy;
  }

  it('a high evasion stat produces dodges; baseline evasion never does', () => {
    const NOW = 1_700_000_000_000;
    // ~40% dodge from the stat (evasion 45 vs enemy accuracy 90).
    const evasive = makeTarget(EVASION_BASELINE + 40);
    const baseline = makeTarget(EVASION_BASELINE);

    let evasiveMisses = 0;
    let baselineMisses = 0;
    for (let i = 0; i < 30; i += 1) {
      const t = NOW + i * 2_000;
      if (applyEnemyAttack(readyEnemy(), evasive, t)?.miss) evasiveMisses += 1;
      if (applyEnemyAttack(readyEnemy(), baseline, t)?.miss) baselineMisses += 1;
    }
    expect(evasiveMisses).toBeGreaterThan(0);
    expect(baselineMisses).toBe(0); // baseline = no balance shift
  });
});
