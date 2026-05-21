import { describe, expect, it } from 'vitest';
import {
  MAX_CHASE_DISTANCE_FROM_SPAWN,
  MAX_CHASE_TIME_WITHOUT_HIT_MS,
  advanceEnemyState,
} from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

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
    className: 'rogue',
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
    maxInventorySlots: 20,
  };
}

describe('enemy anti-kite chase timeout', () => {
  it('stamps chaseStartedAt when idle aggro fires (player out of attack range)', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aiState = 'idle';
    // Place player inside aggro radius but well outside attack range so
    // the if-cascade stops at chasing instead of falling through to
    // attacking (which would clear chaseStartedAt).
    const player = makePlayer('p1', enemy.attackRange * 3, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW,
    });

    expect(enemy.aiState).toBe('chasing');
    expect(enemy.chaseStartedAt).toBe(NOW);
  });

  it('clears chaseStartedAt when chase transitions to attacking (got into range)', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.chaseStartedAt = NOW;
    // Player is within attack range.
    const player = makePlayer('p1', enemy.attackRange * 0.5, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + 1_000,
    });

    expect(enemy.aiState).toBe('attacking');
    expect(enemy.chaseStartedAt).toBeUndefined();
  });

  it('keeps chasing while under MAX_CHASE_TIME_WITHOUT_HIT_MS', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.chaseStartedAt = NOW;
    // Player just outside attack range, well inside leash.
    const player = makePlayer('p1', enemy.attackRange * 2, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + MAX_CHASE_TIME_WITHOUT_HIT_MS - 100,
    });

    expect(enemy.aiState).toBe('chasing');
    expect(enemy.targetId).toBe('p1');
  });

  it('gives up and returns once MAX_CHASE_TIME_WITHOUT_HIT_MS elapses without reaching attack range', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.chaseStartedAt = NOW;
    // Player at the edge of the leash, never reached.
    const player = makePlayer('p1', MAX_CHASE_DISTANCE_FROM_SPAWN - 5, 0);
    enemy.position = { x: 10, y: 0, z: 0 }; // distance to spawn = 10, inside leash
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + MAX_CHASE_TIME_WITHOUT_HIT_MS + 100,
    });

    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
    expect(enemy.chaseStartedAt).toBeUndefined();
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'log',
      message: expect.stringContaining('gave up chase'),
    }));
  });

});

describe('enemy anti-kite chase timeout: in-out cycle', () => {
  it('timer resets when the player briefly enters attack range then re-escapes', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.chaseStartedAt = NOW;
    enemy.position = { x: 5, y: 0, z: 0 };
    const player = makePlayer('p1', 5 + enemy.attackRange * 0.5, 0);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    // Tick 1: in range → transitions to attacking, clears chaseStartedAt.
    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + 1_000,
    });
    expect(enemy.aiState).toBe('attacking');

    // Tick 2: player runs back out of range → switches back to chasing.
    player.position = { x: 5 + enemy.attackRange * 3, y: 0, z: 0 };
    spatial.move(player.id, { x: 5 + enemy.attackRange * 0.5, z: 0 }, player.position);
    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + 1_100,
    });
    expect(enemy.aiState).toBe('chasing');

    // chaseStartedAt was stamped on the attacking→chasing flip in tick 2.
    expect(enemy.chaseStartedAt).toBe(NOW + 1_100);

    // Tick 3: 7 seconds after stamp — still under the fresh 8s timer.
    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + 1_100 + 7_000,
    });
    expect(enemy.aiState).toBe('chasing');
    expect(enemy.chaseStartedAt).toBe(NOW + 1_100);

    // Tick 4: 9 seconds after stamp — fresh timer trips. Without ??=
    // persistence + the attacking→chasing chaseStartedAt stamp + the
    // ANTI_KITE_REAGGRO_COOLDOWN_MS gate, this would either compare
    // now to itself (no trip) or instantly re-aggro inside the same
    // tick (trip is invisible to gameplay).
    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW + 1_100 + 9_000,
    });
    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
    expect(enemy.aggroSuppressedUntilTs).toBeGreaterThan(NOW + 1_100 + 9_000);
  });
});
