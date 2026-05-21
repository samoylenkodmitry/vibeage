import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { forgetMovementFreshness } from '../server/movement/staleIntentTracker';
import { forgetSocketRateLimits, RATE_LIMITS } from '../server/world/rateLimiter';
import type { ClientMessage } from '../packages/protocol/clientMessages';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

const makePlayer = (id: string, socketId: string): PlayerState => ({
  id,
  socketId,
  name: id,
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
  maxInventorySlots: 20,
});

function dispatch(msg: ClientMessage, socketId = 'socket1', state = makeState()): void {
  const socket = { id: socketId, emit: vi.fn() };
  handleClientMessage(socket, state, msg, { publish: vi.fn() }, new SpatialHashGrid());
}

function makeState() {
  const state = createGameState();
  state.players.player1 = makePlayer('player1', 'socket1');
  state.players.player2 = makePlayer('player2', 'socket2');
  return state;
}

describe('rate-limit dropped counter', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    forgetSocketRateLimits('socket1');
  });

  it('increments rateLimit.dropped.{type} and rateLimit.dropped.total when bucket is empty', () => {
    const cap = RATE_LIMITS.identity.capacity;
    // Drain the identity bucket — capacity allows N before dropping.
    for (let i = 0; i < cap; i++) {
      dispatch({ type: 'SelectRace', race: 'human' });
    }
    expect(runtimeMetrics.snapshot().counters['rateLimit.dropped.SelectRace']).toBeUndefined();

    dispatch({ type: 'SelectRace', race: 'human' });
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['rateLimit.dropped.SelectRace']).toBe(1);
    expect(counters['rateLimit.dropped.total']).toBe(1);
  });
});

describe('invalid-ownership counter', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    forgetSocketRateLimits('socket1');
    forgetSocketRateLimits('socket2');
    forgetMovementFreshness('socket1');
    forgetMovementFreshness('socket2');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('increments invalidOwnership.MoveIntent when a player sends a MoveIntent for someone else', () => {
    dispatch(
      { type: 'MoveIntent', id: 'player2', targetPos: { x: 1, z: 1 }, clientTs: NOW },
      'socket1',
    );
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.MoveIntent']).toBe(1);
    expect(counters['clientMessages.invalidOwnership.total']).toBe(1);
  });

  it('increments invalidOwnership.CastReq when a player sends a CastReq for someone else', () => {
    dispatch(
      { type: 'CastReq', id: 'player2', skillId: 'fireball', clientTs: 1 },
      'socket1',
    );
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.CastReq']).toBe(1);
    expect(counters['clientMessages.invalidOwnership.total']).toBe(1);
  });

  it('increments invalidOwnership.LootPickup when a player tries to pick up loot owned by another player', () => {
    dispatch(
      { type: 'LootPickup', lootId: 'loot1', playerId: 'player2' },
      'socket1',
    );
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.LootPickup']).toBe(1);
    expect(counters['clientMessages.invalidOwnership.total']).toBe(1);
  });

  it('does not increment invalidOwnership when the player ID does not exist (CastReq)', () => {
    dispatch(
      { type: 'CastReq', id: 'nonexistent-player', skillId: 'fireball', clientTs: 1 },
      'socket1',
    );
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.CastReq']).toBeUndefined();
    expect(counters['clientMessages.invalidOwnership.total']).toBeUndefined();
  });

  it('does not increment invalidOwnership when the player ID does not exist (LootPickup)', () => {
    dispatch(
      { type: 'LootPickup', lootId: 'loot1', playerId: 'nonexistent-player' },
      'socket1',
    );
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.LootPickup']).toBeUndefined();
    expect(counters['clientMessages.invalidOwnership.total']).toBeUndefined();
  });

  it('does not increment invalidOwnership for valid same-socket actions', () => {
    dispatch(
      { type: 'MoveIntent', id: 'player1', targetPos: { x: 1, z: 1 }, clientTs: NOW },
      'socket1',
    );
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.MoveIntent']).toBeUndefined();
    expect(counters['clientMessages.invalidOwnership.total']).toBeUndefined();
  });
});
