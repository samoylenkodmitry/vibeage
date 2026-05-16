import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  MAX_CLIENT_CLOCK_SKEW_MS,
  MovementIntentFreshness,
  forgetMovementFreshness,
  sharedMovementFreshness,
} from '../server/movement/staleIntentTracker';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { forgetSocketRateLimits } from '../server/world/rateLimiter';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'p',
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],
  skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
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
});

describe('MovementIntentFreshness', () => {
  it('accepts the first MoveIntent for any socket', () => {
    const f = new MovementIntentFreshness();
    expect(f.check('s', NOW, NOW)).toBeNull();
  });

  it('rejects out-of-order intents', () => {
    const f = new MovementIntentFreshness();
    f.check('s', NOW, NOW);
    expect(f.check('s', NOW - 5, NOW)).toBe('outOfOrder');
  });

  it('rejects intents with equal clientTs (replay of the same packet)', () => {
    const f = new MovementIntentFreshness();
    f.check('s', NOW, NOW);
    expect(f.check('s', NOW, NOW)).toBe('outOfOrder');
  });

  it('rejects intents with clientTs too far in the future', () => {
    const f = new MovementIntentFreshness();
    expect(f.check('s', NOW + MAX_CLIENT_CLOCK_SKEW_MS + 1, NOW)).toBe('clockSkew');
  });

  it('rejects intents with clientTs too far in the past', () => {
    const f = new MovementIntentFreshness();
    expect(f.check('s', NOW - MAX_CLIENT_CLOCK_SKEW_MS - 1, NOW)).toBe('clockSkew');
  });

  it('tracks freshness per socket independently', () => {
    const f = new MovementIntentFreshness();
    f.check('sA', NOW, NOW);
    expect(f.check('sB', NOW - 100, NOW)).toBeNull();
  });

  it('forget clears state so the next intent from a returning socket is accepted', () => {
    const f = new MovementIntentFreshness();
    f.check('s', NOW, NOW);
    f.forget('s');
    expect(f.check('s', NOW - 100, NOW)).toBeNull();
  });
});

describe('clientMessageRouter stale MoveIntent rejection', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    forgetSocketRateLimits('socket1');
    forgetMovementFreshness('socket1');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('passes a fresh MoveIntent through to applyMoveIntent', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const socket = { id: 'socket1', emit: vi.fn() };

    handleClientMessage(
      socket,
      state,
      { type: 'MoveIntent', id: 'player1', targetPos: { x: 1, z: 1 }, clientTs: NOW },
      { publish: vi.fn() },
      new SpatialHashGrid(),
    );

    expect(state.players.player1.movement?.isMoving).toBe(true);
    expect(runtimeMetrics.snapshot().counters['movement.staleIntent.total']).toBeUndefined();
  });

  it('drops a replayed MoveIntent (same clientTs) and bumps movement.staleIntent.outOfOrder', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const socket = { id: 'socket1', emit: vi.fn() };
    const msg = { type: 'MoveIntent' as const, id: 'player1', targetPos: { x: 1, z: 1 }, clientTs: NOW };

    handleClientMessage(socket, state, msg, { publish: vi.fn() }, new SpatialHashGrid());
    state.players.player1.movement = undefined; // reset to detect the second call's effect
    handleClientMessage(socket, state, msg, { publish: vi.fn() }, new SpatialHashGrid());

    expect(state.players.player1.movement).toBeUndefined();
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['movement.staleIntent.outOfOrder']).toBe(1);
    expect(counters['movement.staleIntent.total']).toBe(1);
  });

  it('drops a MoveIntent with clockSkew clientTs and bumps movement.staleIntent.clockSkew', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const socket = { id: 'socket1', emit: vi.fn() };

    handleClientMessage(
      socket,
      state,
      {
        type: 'MoveIntent',
        id: 'player1',
        targetPos: { x: 1, z: 1 },
        clientTs: NOW + MAX_CLIENT_CLOCK_SKEW_MS + 5_000,
      },
      { publish: vi.fn() },
      new SpatialHashGrid(),
    );

    expect(state.players.player1.movement).toBeUndefined();
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['movement.staleIntent.clockSkew']).toBe(1);
    expect(counters['movement.staleIntent.total']).toBe(1);
  });
});

describe('sharedMovementFreshness lifecycle', () => {
  it('forgetMovementFreshness clears the shared instance', () => {
    const f = sharedMovementFreshness();
    f.check('cleanup-socket', NOW, NOW);
    forgetMovementFreshness('cleanup-socket');
    expect(f.check('cleanup-socket', NOW - 100, NOW)).toBeNull();
  });
});
