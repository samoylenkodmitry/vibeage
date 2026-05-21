import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { applyMoveIntent } from '../server/movement/moveIntent';
import { handleCastReq } from '../server/combat/castHandler';
import { createActiveCastStore } from '../server/combat/skillSystem';
import { isEntityStunned } from '../server/combat/statusQueries';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function effect(type: string): StatusEffect {
  return {
    id: `e-${type}`,
    type,
    value: 1,
    durationMs: 3_000,
    startTimeTs: NOW,
    sourceSkill: 'petrify',
  };
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
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
  };
}

describe('isEntityStunned recognises freeze and root', () => {
  it('returns true for an active freeze effect', () => {
    expect(isEntityStunned(makePlayer({ statusEffects: [effect('freeze')] }), NOW)).toBe(true);
  });

  it('returns true for an active root effect', () => {
    expect(isEntityStunned(makePlayer({ statusEffects: [effect('root')] }), NOW)).toBe(true);
  });

  it('returns false for an active slow effect (not action-blocking)', () => {
    expect(isEntityStunned(makePlayer({ statusEffects: [effect('slow')] }), NOW)).toBe(false);
  });
});

describe('frozen player blocks move and cast like stun', () => {
  it('applyMoveIntent rejects a frozen player with reason "stunned"', () => {
    const state = createGameState();
    const player = makePlayer({ statusEffects: [effect('freeze')] });
    state.players[player.id] = player;

    const result = applyMoveIntent(
      state,
      's1',
      { type: 'MoveIntent', id: player.id, targetPos: { x: 1, z: 1 }, clientTs: NOW },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('stunned');
  });

  it('handleCastReq rejects a rooted player and emits CastFail', () => {
    const player = makePlayer({ statusEffects: [effect('root')] });
    const sentMessages: unknown[] = [];
    const direct = { send: (msg: unknown) => { sentMessages.push(msg); } };
    const outbound: OutboundEventSink = { publish: () => undefined };
    const world: CombatWorld = {
      getEnemyById: () => null,
      getPlayerById: (id) => (id === player.id ? player : null),
      getEntitiesInCircle: () => [],
      onTargetDied: vi.fn(),
    };

    handleCastReq(
      { id: 's1' },
      player,
      { type: 'CastReq', id: player.id, skillId: 'fireball', clientTs: NOW },
      { direct, outbound },
      world,
      createActiveCastStore(),
    );

    // §52 #1 — CastFail retired; check CommandRejected envelope.
    expect(sentMessages).toContainEqual(expect.objectContaining({
      type: 'CommandRejected', commandType: 'CastReq', reason: 'invalid',
    }));
  });
});

describe('frozen enemy stops moving / attacking like stunned', () => {
  it('chasing+frozen enemy zeros velocity and preserves state', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.position = { x: 5, y: 0, z: 0 };
    enemy.aiState = 'chasing';
    enemy.targetId = 'p1';
    enemy.velocity = { x: 4, z: 0 };
    enemy.statusEffects = [effect('freeze')];
    const player = makePlayer({ position: { x: 10, y: 0, z: 0 } });
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
    expect(enemy.aiState).toBe('chasing');
  });
});
