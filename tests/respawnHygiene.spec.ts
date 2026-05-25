import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { onRespawnRequest, respawnPlayer } from '../server/players/playerLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function makeDeadPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'player1',
    socketId: 'socket1',
    name: 'player1',
    position: { x: 100, y: 0.5, z: 100 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 0,
    maxHealth: 100,
    mana: 0,
    maxMana: 100,
    className: 'mage',
    unlockedSkills: ['fireball'],

    availableSkillPoints: 1,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: false,
    deathTimeTs: NOW,
    maxInventorySlots: 20,
    ...overrides,
  };
}

describe('respawn hygiene: clears carried-over state', () => {
  it('clears statusEffects so a Burn that killed the player does not re-kill instantly', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const burn: StatusEffect = {
      id: 'b1', type: 'burn', value: 50, durationMs: 10_000,
      startTimeTs: NOW - 1_000, sourceSkill: 'fireball',
    };
    state.players.player1 = makeDeadPlayer({ statusEffects: [burn] });

    respawnPlayer(state, spatial, 'player1');

    expect(state.players.player1.statusEffects).toEqual([]);
  });

  it('clears casting state so an interrupted cast does not stick on the bar', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer({
      castingSkill: 'fireball',
      castingProgressMs: 250,
    });

    respawnPlayer(state, spatial, 'player1');

    expect(state.players.player1.castingSkill).toBeNull();
    expect(state.players.player1.castingProgressMs).toBe(0);
  });

  it('clears movement target so the player does not walk on respawn', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer({
      movement: { isMoving: true, targetPos: { x: 50, z: 50 }, lastUpdateTime: NOW, speed: 5 },
      velocity: { x: 5, z: 0 },
    });

    respawnPlayer(state, spatial, 'player1');

    expect(state.players.player1.movement).toBeUndefined();
    expect(state.players.player1.velocity).toEqual({ x: 0, z: 0 });
  });

  it('clears targetId (stale enemy from before death)', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer({ targetId: 'enemy-99' });

    respawnPlayer(state, spatial, 'player1');

    expect(state.players.player1.targetId).toBeNull();
  });

  it('removes the players in-flight casts from state.activeCasts', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer();
    // Two casts for player1, one for an unrelated caster.
    state.activeCasts.cast1 = { castId: 'cast1', casterId: 'player1', skillId: 'fireball', state: CastState.Casting, origin: { x: 0, z: 0 }, startedAt: NOW, castTimeMs: 300 };
    state.activeCasts.cast2 = { castId: 'cast2', casterId: 'player1', skillId: 'iceBolt', state: CastState.Casting, origin: { x: 0, z: 0 }, startedAt: NOW, castTimeMs: 300 };
    state.activeCasts.cast3 = { castId: 'cast3', casterId: 'other-player', skillId: 'fireball', state: CastState.Casting, origin: { x: 0, z: 0 }, startedAt: NOW, castTimeMs: 300 };

    respawnPlayer(state, spatial, 'player1');

    expect(state.activeCasts.cast1).toBeUndefined();
    expect(state.activeCasts.cast2).toBeUndefined();
    // Other players in-flight casts are untouched.
    expect(state.activeCasts.cast3).toBeDefined();
  });

  it('removes the player effectsByTarget row (stale per-target effect store)', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer();
    state.effectsByTarget.player1 = [
      { id: 'b1', type: 'burn', value: 5, durationMs: 5_000, startTimeTs: NOW, sourceSkill: 'fireball' },
    ];

    respawnPlayer(state, spatial, 'player1');

    expect(state.effectsByTarget.player1).toBeUndefined();
  });
});

describe('respawn ownership check', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('refuses to respawn a player owned by a different socket', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer();
    const outbound = { publish: vi.fn() };

    onRespawnRequest(
      state,
      { type: 'RespawnRequest', id: 'player1', clientTs: NOW },
      outbound,
      spatial,
      'someone-elses-socket',
    );

    expect(outbound.publish).not.toHaveBeenCalled();
    expect(state.players.player1.isAlive).toBe(false);
    // Unauthorized attempt surfaces in metrics for ops visibility.
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['clientMessages.invalidOwnership.RespawnRequest']).toBe(1);
    expect(counters['clientMessages.invalidOwnership.total']).toBe(1);
  });

  it('accepts respawn from the owning socket', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makeDeadPlayer();
    const outbound = { publish: vi.fn() };

    onRespawnRequest(
      state,
      { type: 'RespawnRequest', id: 'player1', clientTs: NOW },
      outbound,
      spatial,
      'socket1',
    );

    expect(outbound.publish).toHaveBeenCalledOnce();
    expect(state.players.player1.isAlive).toBe(true);
  });

  it('refuses to respawn an unknown player ID without throwing', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };

    onRespawnRequest(
      state,
      { type: 'RespawnRequest', id: 'nonexistent', clientTs: NOW },
      outbound,
      spatial,
      'socket1',
    );

    expect(outbound.publish).not.toHaveBeenCalled();
  });
});
