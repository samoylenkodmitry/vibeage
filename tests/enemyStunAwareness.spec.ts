import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

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

function stunEffect(overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: 's1',
    type: 'stun',
    value: 1,
    durationMs: 3_000,
    startTimeTs: NOW,
    sourceSkill: 'petrify',
    ...overrides,
  };
}

describe('stunned enemies skip all AI actions', () => {
  it('stunned chasing enemy stops moving and keeps the chasing state for after the stun', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    enemy.position = { x: 5, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.velocity = { x: 4, z: 0 };
    enemy.statusEffects = [stunEffect()];
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

    expect(enemy.velocity).toEqual({ x: 0, z: 0 });
    // State is preserved so the enemy resumes chasing after stun.
    expect(enemy.aiState).toBe('chasing');
    expect(enemy.targetId).toBe('p1');
  });

  it('stunned attacking enemy does not damage the player', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 2);
    enemy.position = { x: 1, y: 0, z: 0 };
    enemy.aiState = 'attacking';
    enemy.targetId = 'p1';
    enemy.statusEffects = [stunEffect()];
    const player = makePlayer('p1', 1.5, 0);
    const startingHealth = player.health;
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);
    spatial.insert(player.id, player.position);

    const result = advanceEnemyState(enemy, {
      players: { p1: player },
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: NOW,
    });

    expect(player.health).toBe(startingHealth);
    expect(result.events).not.toContainEqual(
      expect.objectContaining({ type: 'enemyAttack' }),
    );
  });

  it('stunned idle enemy does not aggro a nearby player', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    enemy.aiState = 'idle';
    enemy.statusEffects = [stunEffect()];
    const player = makePlayer('p1', 1, 0);
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
    expect(enemy.aiState).toBe('idle');
  });

  it('expired stun no longer blocks enemy actions (chase resumes)', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 4);
    enemy.position = { x: 5, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    // Stun started 5s ago with 3s duration → expired at NOW.
    enemy.statusEffects = [stunEffect({ durationMs: 3_000, startTimeTs: NOW - 5_000 })];
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

    // Chase resumed → enemy moved (velocity non-zero toward player).
    expect(Math.abs(enemy.velocity?.x ?? 0)).toBeGreaterThan(0);
    expect(enemy.aiState).toBe('chasing');
  });
});
