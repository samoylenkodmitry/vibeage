import { describe, expect, it } from 'vitest';
import { MAX_CHASE_DISTANCE_FROM_SPAWN, advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

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

describe('enemy chase leash', () => {
  it('keeps chasing while within MAX_CHASE_DISTANCE_FROM_SPAWN', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    enemy.position = { x: MAX_CHASE_DISTANCE_FROM_SPAWN - 5, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    const player = makePlayer('p1', MAX_CHASE_DISTANCE_FROM_SPAWN + 5, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 1_000,
    });

    expect(enemy.aiState).toBe('chasing');
    expect(enemy.targetId).toBe('p1');
  });

  it('drops target and switches to returning once past leash distance', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 2);
    enemy.position = { x: MAX_CHASE_DISTANCE_FROM_SPAWN + 5, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    const player = makePlayer('p1', MAX_CHASE_DISTANCE_FROM_SPAWN + 50, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 2_000,
    });

    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
    // The same tick re-enters advanceReturningEnemy after the leash flip
    // and begins moving the enemy home, so velocity points back toward spawn.
    expect(enemy.velocity?.x).toBeLessThan(0);
    expect(result.events).toContainEqual({
      type: 'log',
      message: expect.stringContaining('exceeded leash distance'),
    });
    expect(result.enemyUpdate).toEqual({
      id: enemy.id,
      targetId: null,
      aiState: 'returning',
    });
  });

});

describe('enemy chase leash: bounce prevention', () => {
  it('does not bounce back to chasing in the same tick when the player hovers at the leash boundary', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 4);
    enemy.position = { x: MAX_CHASE_DISTANCE_FROM_SPAWN + 0.1, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.aggroRadius = 100; // player is well within aggro
    const player = makePlayer('p1', MAX_CHASE_DISTANCE_FROM_SPAWN + 1, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 4_000,
    });

    // After the leash trip: enemy should be returning, not chasing.
    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
  });

  it('does not re-aggro while returning if still beyond the leash boundary', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 5);
    enemy.position = { x: MAX_CHASE_DISTANCE_FROM_SPAWN + 5, y: 0, z: 0 };
    enemy.aiState = 'returning';
    enemy.targetId = null;
    enemy.aggroRadius = 100;
    const player = makePlayer('p1', MAX_CHASE_DISTANCE_FROM_SPAWN + 10, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 5_000,
    });

    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
  });

  it('re-aggros once back inside the leash boundary while returning', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 6);
    enemy.position = { x: 30, y: 0, z: 0 }; // within leash, returning to spawn
    enemy.aiState = 'returning';
    enemy.targetId = null;
    enemy.aggroRadius = 100;
    const player = makePlayer('p1', 35, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 6_000,
    });

    expect(enemy.aiState).toBe('chasing');
    expect(enemy.targetId).toBe('p1');
  });

  it('does not apply the leash check when the target is already dead (existing behaviour preserved)', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    enemy.position = { x: MAX_CHASE_DISTANCE_FROM_SPAWN + 100, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p-dead';
    const player = makePlayer('p-dead', 0, 0);
    player.isAlive = false;
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);

    const result = advanceEnemyState(enemy, {
      players: { 'p-dead': player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 3_000,
    });

    // Dead-target branch wins (it runs first); the leash log shouldn't fire.
    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'log',
      message: expect.stringContaining('lost target or target died'),
    }));
    expect(result.events).not.toContainEqual(expect.objectContaining({
      message: expect.stringContaining('exceeded leash distance'),
    }));
  });
});
