import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { applyMoveIntent } from '../server/movement/moveIntent';
import { handleCastReq } from '../server/combat/castHandler';
import { createActiveCastStore } from '../server/combat/skillSystem';
import { isEntityStunned } from '../server/combat/statusQueries';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function stunEffect(overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: 's',
    type: 'stun',
    value: 1,
    durationMs: 3_000,
    startTimeTs: NOW,
    sourceSkill: 'petrify',
    ...overrides,
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
    ...overrides,
  };
}

describe('isEntityStunned shared helper', () => {
  it('returns false for missing statusEffects', () => {
    const p = makePlayer();
    (p as Partial<PlayerState>).statusEffects = undefined;
    expect(isEntityStunned(p as PlayerState, NOW)).toBe(false);
  });

  it('returns true for an active stun effect', () => {
    expect(isEntityStunned(makePlayer({ statusEffects: [stunEffect()] }), NOW)).toBe(true);
  });

  it('returns false for an expired stun effect', () => {
    const expired = stunEffect({ durationMs: 1_000, startTimeTs: NOW - 5_000 });
    expect(isEntityStunned(makePlayer({ statusEffects: [expired] }), NOW)).toBe(false);
  });
});

describe('applyMoveIntent rejects stunned players', () => {
  it('returns reason "stunned" and zeroes velocity when player is stunned', () => {
    const state = createGameState();
    const player = makePlayer({
      statusEffects: [stunEffect()],
      movement: { isMoving: true, targetPos: { x: 10, z: 0 }, lastUpdateTime: NOW - 100, speed: 5 },
      velocity: { x: 5, z: 0 },
    });
    state.players[player.id] = player;

    const result = applyMoveIntent(
      state,
      's1',
      { type: 'MoveIntent', id: player.id, targetPos: { x: 1, z: 1 }, clientTs: NOW },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe('stunned');
    }
    expect(player.velocity).toEqual({ x: 0, z: 0 });
    expect(player.movement?.isMoving).toBe(false);
  });

  it('does not mark dirty when a stunned player was already stopped (no redundant snapshot)', () => {
    const state = createGameState();
    const player = makePlayer({ statusEffects: [stunEffect()] });
    player.dirtySnap = false;
    state.players[player.id] = player;

    applyMoveIntent(
      state,
      's1',
      { type: 'MoveIntent', id: player.id, targetPos: { x: 1, z: 1 }, clientTs: NOW },
      NOW,
    );

    expect(player.dirtySnap).toBe(false);
  });

  it('accepts MoveIntent normally when the player is not stunned', () => {
    const state = createGameState();
    const player = makePlayer();
    state.players[player.id] = player;

    const result = applyMoveIntent(
      state,
      's1',
      { type: 'MoveIntent', id: player.id, targetPos: { x: 1, z: 1 }, clientTs: NOW },
      NOW,
    );

    expect(result.ok).toBe(true);
  });
});

describe('handleCastReq rejects stunned players', () => {
  function makeWorld(player: PlayerState): CombatWorld {
    return {
      getEnemyById: () => null,
      getPlayerById: (id) => (id === player.id ? player : null),
      getEntitiesInCircle: () => [],
      onTargetDied: vi.fn(),
    };
  }

  it('emits CastFail(invalid) when player is stunned and does not start a cast', () => {
    const player = makePlayer({ statusEffects: [stunEffect()] });
    const sentMessages: unknown[] = [];
    const direct = { send: (msg: unknown) => { sentMessages.push(msg); } };
    const outboundEvents: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => { outboundEvents.push(e); } };
    const activeCasts = createActiveCastStore();
    const socket = { id: 's1', send: vi.fn() };

    handleCastReq(
      socket,
      player,
      { type: 'CastReq', id: player.id, skillId: 'fireball', clientTs: NOW },
      { direct, outbound },
      makeWorld(player),
      { activeCasts, now: Date.now() },
    );

    expect(Object.keys(activeCasts)).toEqual([]);
    // §52 #1 — CastFail retired; check the structured envelope.
    expect(sentMessages).toContainEqual(expect.objectContaining({
      type: 'CommandRejected', commandType: 'CastReq', reason: 'invalid',
    }));
  });
});
