import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { getEnemyMovementSpeed, moveEnemyToward } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function effect(type: string, overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: `e-${type}`,
    type,
    value: 1,
    durationMs: 5_000,
    startTimeTs: NOW,
    sourceSkill: 'iceBolt',
    ...overrides,
  };
}

function makePlayer(id: string, x: number, z: number): PlayerState {
  return {
    id,
    socketId: `${id}-s`,
    name: id,
    position: { x, y: 0, z },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'mage',
    unlockedSkills: [],
    skillShortcuts: [],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    inventory: [],
    maxInventorySlots: 20,
  };
}

describe('getEnemyMovementSpeed', () => {
  it('returns base movementSpeed when no effects active', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    expect(getEnemyMovementSpeed(enemy, NOW)).toBe(enemy.movementSpeed);
  });

  it('multiplies by 0.7 under an active slow effect', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 2);
    enemy.statusEffects = [effect('slow')];
    expect(getEnemyMovementSpeed(enemy, NOW)).toBeCloseTo(enemy.movementSpeed * 0.7, 5);
  });

  it('multiplies by 1.3 under an active speed_boost effect (symmetric with player)', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    enemy.statusEffects = [effect('speed_boost', { sourceSkill: 'rapidFire' })];
    expect(getEnemyMovementSpeed(enemy, NOW)).toBeCloseTo(enemy.movementSpeed * 1.3, 5);
  });

  it('stacks slow + speed_boost multiplicatively', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 4);
    enemy.statusEffects = [effect('slow'), effect('speed_boost')];
    expect(getEnemyMovementSpeed(enemy, NOW)).toBeCloseTo(enemy.movementSpeed * 0.7 * 1.3, 5);
  });

  it('ignores expired slow effects', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 5);
    enemy.statusEffects = [effect('slow', { startTimeTs: NOW - 10_000, durationMs: 1_000 })];
    expect(getEnemyMovementSpeed(enemy, NOW)).toBe(enemy.movementSpeed);
  });
});

describe('moveEnemyToward applies slow speed', () => {
  it('sets slower velocity when slowed compared to unaffected baseline', () => {
    const baseline = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 6);
    const slowed = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 7);
    slowed.statusEffects = [effect('slow')];
    const spatial = new SpatialHashGrid(1);
    spatial.insert(baseline.id, baseline.position);
    spatial.insert(slowed.id, slowed.position);

    // PR #324 — `moveEnemyToward` only sets velocity now; position
    // integration belongs to the movement phase. Slow factor still
    // observable on the velocity vector itself.
    moveEnemyToward(baseline, { x: 100, z: 0 }, spatial, 1, NOW);
    moveEnemyToward(slowed, { x: 100, z: 0 }, spatial, 1, NOW);

    expect(slowed.velocity!.x).toBeLessThan(baseline.velocity!.x);
    expect(slowed.velocity!.x).toBeCloseTo(baseline.velocity!.x * 0.7, 5);
  });
});

describe('advanceEnemyState propagates slow into chase movement', () => {
  it('chasing slowed enemy moves with reduced velocity magnitude', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 8);
    enemy.position = { x: 0, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.statusEffects = [effect('slow')];
    const player = makePlayer('p1', 10, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW,
    });

    const expectedSpeed = enemy.movementSpeed * 0.7;
    expect(Math.abs(enemy.velocity?.x ?? 0)).toBeCloseTo(expectedSpeed, 5);
  });
});
