import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy, DEFAULT_BOSS_CONFIG } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

function makePlayer(): PlayerState {
  return {
    id: 'p1',
    socketId: 's1',
    name: 'p1',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'mage',
    unlockedSkills: ['fireball'],

    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

describe('mini-boss enrage', () => {
  it('enrages after the configured combat time and multiplies damage once', () => {
    const boss = createEnemy('dragon', 10, { x: 0, y: 0.5, z: 0 }, 1, {
      isMiniBoss: true,
      nameOverride: 'Vorthax',
      healthMultiplier: 4,
      damageMultiplier: 1.8,
    });
    const baseDamage = boss.baseAttackDamage ?? boss.attackDamage;
    boss.aiState = 'attacking';
    boss.targetId = 'p1';
    // Move boss off its spawn so a same-tick cascade into 'returning'
    // doesn't snap home + reset progression before the assertion runs.
    boss.position = { x: 50, y: 0.5, z: 50 };
    const player = makePlayer();
    player.position = { x: 50, y: 0.5, z: 50 };
    player.health = 1_000_000;
    player.maxHealth = 1_000_000;
    const players = { p1: player };
    const spatial = new SpatialHashGrid();

    const start = 1_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    expect(boss.combatStartedTs).toBe(start);
    expect(boss.enraged).toBeFalsy();

    advanceEnemyState(boss, {
      players,
      spatialGrid: spatial,
      deltaTime: 0.05,
      now: start + DEFAULT_BOSS_CONFIG.enrageAfterMs + 1,
    });
    expect(boss.enraged).toBe(true);
    expect(boss.attackDamage).toBeCloseTo(baseDamage * DEFAULT_BOSS_CONFIG.enragedDamageMul, 5);

    // Re-tick: enrage only fires once; damage doesn't compound.
    advanceEnemyState(boss, {
      players,
      spatialGrid: spatial,
      deltaTime: 0.05,
      now: start + DEFAULT_BOSS_CONFIG.enrageAfterMs + 1000,
    });
    expect(boss.attackDamage).toBeCloseTo(baseDamage * DEFAULT_BOSS_CONFIG.enragedDamageMul, 5);
  });

});

describe('mini-boss phase shift + reset', () => {
  it('phase-shifts on HP threshold cross with speed + damage buffs', () => {
    const boss = createEnemy('deep_leviathan', 12, { x: 0, y: 0.5, z: 0 }, 2, {
      isMiniBoss: true,
      nameOverride: 'Cthulun',
      healthMultiplier: 5,
      damageMultiplier: 2.2,
    });
    const baseDamage = boss.baseAttackDamage ?? boss.attackDamage;
    const baseSpeed = boss.baseMovementSpeed ?? boss.movementSpeed;
    boss.aiState = 'attacking';
    boss.targetId = 'p1';
    boss.health = boss.maxHealth * 0.51;
    const players = { p1: makePlayer() };
    const spatial = new SpatialHashGrid();

    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: 5_000 });
    expect(boss.phaseShifted).toBeFalsy();

    boss.health = boss.maxHealth * 0.49;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: 6_000 });
    expect(boss.phaseShifted).toBe(true);
    expect(boss.movementSpeed).toBeCloseTo(baseSpeed * DEFAULT_BOSS_CONFIG.phaseTwoSpeedMul, 5);
    expect(boss.attackDamage).toBeCloseTo(baseDamage * DEFAULT_BOSS_CONFIG.phaseTwoDamageMul, 5);
  });

  it('returning to spawn resets enrage + phase, restoring base stats', () => {
    const boss = createEnemy('temporal_overlord', 15, { x: 0, y: 0.5, z: 0 }, 3, {
      isMiniBoss: true,
      nameOverride: 'Aethariel',
      healthMultiplier: 5.5,
      damageMultiplier: 2.4,
    });
    const baseDamage = boss.baseAttackDamage!;
    const baseSpeed = boss.baseMovementSpeed!;
    boss.enraged = true;
    boss.phaseShifted = true;
    boss.attackDamage = baseDamage * 5;
    boss.movementSpeed = baseSpeed * 5;
    boss.aiState = 'returning';
    boss.position = { ...boss.spawnPosition };
    const players = { p1: makePlayer() };
    const spatial = new SpatialHashGrid();

    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: 10_000 });

    expect(boss.aiState).toBe('idle');
    expect(boss.enraged).toBe(false);
    expect(boss.phaseShifted).toBe(false);
    expect(boss.attackDamage).toBeCloseTo(baseDamage, 5);
    expect(boss.movementSpeed).toBeCloseTo(baseSpeed, 5);
  });

  it('does not touch normal mobs', () => {
    const grunt = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    grunt.aiState = 'attacking';
    grunt.targetId = 'p1';
    const players = { p1: makePlayer() };
    const spatial = new SpatialHashGrid();

    advanceEnemyState(grunt, {
      players,
      spatialGrid: spatial,
      deltaTime: 0.05,
      now: DEFAULT_BOSS_CONFIG.enrageAfterMs * 5,
    });
    expect(grunt.enraged).toBeFalsy();
    expect(grunt.combatStartedTs).toBeUndefined();
    expect(grunt.bossConfig).toBeUndefined();
  });
});
