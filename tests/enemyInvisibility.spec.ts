import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { findAggroTargetId, isPlayerInvisible } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function makePlayer(id: string, x: number, z: number, effects: StatusEffect[] = []): PlayerState {
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
    statusEffects: effects,
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

const invisibleEffect: StatusEffect = {
  id: 'v',
  type: 'invisible',
  value: 1,
  durationMs: 6_000,
  startTimeTs: NOW,
  sourceSkill: 'vanish',
};

describe('isPlayerInvisible', () => {
  it('returns false when no invisible effect', () => {
    expect(isPlayerInvisible(makePlayer('p', 0, 0), NOW)).toBe(false);
  });

  it('returns true for an active invisible effect', () => {
    expect(isPlayerInvisible(makePlayer('p', 0, 0, [invisibleEffect]), NOW)).toBe(true);
  });

  it('returns false for an expired invisible effect', () => {
    const expired: StatusEffect = { ...invisibleEffect, durationMs: 1_000, startTimeTs: NOW - 5_000 };
    expect(isPlayerInvisible(makePlayer('p', 0, 0, [expired]), NOW)).toBe(false);
  });

  it('returns false when statusEffects is missing entirely', () => {
    const p = makePlayer('p', 0, 0);
    (p as Partial<PlayerState>).statusEffects = undefined;
    expect(isPlayerInvisible(p, NOW)).toBe(false);
  });
});

describe('findAggroTargetId skips invisible players', () => {
  it('skips an invisible candidate even if within aggro range', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    const invisible = makePlayer('inv', 1, 0, [invisibleEffect]);
    const visible = makePlayer('vis', 5, 0);
    const result = findAggroTargetId(
      enemy,
      { inv: invisible, vis: visible },
      ['inv', 'vis'],
      NOW,
    );
    expect(result).toBe('vis');
  });

  it('returns null if every nearby player is invisible', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 2);
    const a = makePlayer('a', 1, 0, [invisibleEffect]);
    const b = makePlayer('b', 2, 0, [invisibleEffect]);
    expect(findAggroTargetId(enemy, { a, b }, ['a', 'b'], NOW)).toBeNull();
  });
});

describe('advanceEnemyState drops invisible targets', () => {
  it('chasing → returning when current target turns invisible', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    enemy.position = { x: 5, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    const player = makePlayer('p1', 10, 0, [invisibleEffect]);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW,
    });

    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
    expect(result.events).toContainEqual({
      type: 'log',
      message: expect.stringContaining('invisible target'),
    });
  });

  it('attacking → returning when current target turns invisible mid-attack', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 4);
    // Enemy is far from spawn so the cascade through advanceReturningEnemy
    // doesn't immediately snap-to-idle (returning → idle threshold is 1.0).
    enemy.position = { x: 10, y: 0, z: 0 };
    enemy.aiState = 'attacking';
    enemy.targetId = 'p1';
    const player = makePlayer('p1', 10.5, 0, [invisibleEffect]);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW,
    });

    expect(enemy.aiState).toBe('returning');
    expect(enemy.targetId).toBeNull();
    // Player health untouched (no attack landed).
    expect(player.health).toBe(100);
    expect(result.events).toContainEqual({
      type: 'log',
      message: expect.stringContaining('mid-attack'),
    });
  });

  it('idle enemy does not aggro a nearby invisible player', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 5);
    enemy.aiState = 'idle';
    const player = makePlayer('p1', 1, 0, [invisibleEffect]);
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW,
    });

    expect(enemy.targetId).toBeFalsy();
    expect(enemy.aiState).not.toBe('chasing');
  });
});
