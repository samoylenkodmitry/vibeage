import { describe, expect, test } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (id: string, x: number, z: number, overrides: Partial<PlayerState> = {}): PlayerState => ({
  id,
  socketId: `${id}-socket`,
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
  ...overrides,
});

describe('enemy state machine', () => {
  test('aggroes and attacks a nearby alive player without socket dependencies', () => {
    const now = 2_000;
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    const player = makePlayer('player1', 1, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { player1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now,
    });

    expect(enemy.targetId).toBe(player.id);
    expect(enemy.aiState).toBe('attacking');
    expect(player.health).toBe(88);
    expect(result.events).toContainEqual({
      type: 'enemyAttack',
      enemyId: enemy.id,
      targetId: player.id,
      damage: 12,
      targetHealth: 88,
    });
    expect(result.enemyUpdate).toEqual({
      id: enemy.id,
      targetId: player.id,
      aiState: 'attacking',
    });
  });

  test('emits a player killed event and returns after a lethal attack', () => {
    const enemy = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, 2);
    enemy.spawnPosition = { x: 0, y: 0, z: 0 };
    enemy.aiState = 'attacking';
    enemy.targetId = 'player1';
    enemy.attackDamage = 120;
    const player = makePlayer('player1', 6, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { player1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 2_000,
    });

    expect(player.isAlive).toBe(false);
    expect(player.health).toBe(0);
    expect(enemy.targetId).toBeNull();
    expect(enemy.aiState).toBe('returning');
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'playerKilled',
      update: expect.objectContaining({
        id: player.id,
        health: 0,
        isAlive: false,
        deathTimeTs: 2_000,
      }),
    }));
    expect(result.enemyUpdate).toEqual({
      id: enemy.id,
      targetId: null,
      aiState: 'returning',
    });
  });

  test('snaps returning enemies back to idle near their spawn point', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    enemy.position = { x: 0.5, y: 0, z: 0 };
    enemy.aiState = 'returning';
    enemy.velocity = { x: 1, z: 0 };
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);

    const result = advanceEnemyState(enemy, {
      players: {},
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 3_000,
    });

    expect(enemy.aiState).toBe('idle');
    expect(enemy.position).toEqual(enemy.spawnPosition);
    expect(enemy.velocity).toEqual({ x: 0, z: 0 });
    expect((enemy as typeof enemy & { dirtySnap?: boolean }).dirtySnap).toBe(true);
    expect(result.enemyUpdate).toEqual({
      id: enemy.id,
      targetId: null,
      aiState: 'idle',
    });
  });
});
