import { describe, expect, it } from 'vitest';
import { createGameState } from '../server/gameState';
import { advanceAll } from '../server/movement/worldMovement';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function makeEffect(overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: 'e1',
    type: 'burn',
    value: 1,
    durationMs: 5_000,
    startTimeTs: NOW,
    sourceSkill: 'fireball',
    ...overrides,
  };
}

function makePlayer(): PlayerState {
  return {
    id: 'p1',
    socketId: 's1',
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
  };
}

describe('player status effect pruning', () => {
  it('removes effects whose startTimeTs + durationMs <= now', () => {
    const state = createGameState();
    const player = makePlayer();
    player.statusEffects = [
      makeEffect({ id: 'expired-1', durationMs: 1_000, startTimeTs: NOW - 2_000 }),
      makeEffect({ id: 'still-active', durationMs: 5_000, startTimeTs: NOW - 1_000 }),
      makeEffect({ id: 'expired-2', durationMs: 500, startTimeTs: NOW - 5_000, type: 'slow' }),
    ];
    state.players[player.id] = player;

    advanceAll(state, new SpatialHashGrid(), 100, NOW);

    expect(state.players[player.id].statusEffects.map(e => e.id)).toEqual(['still-active']);
  });

  it('leaves status effects untouched if none are expired', () => {
    const state = createGameState();
    const player = makePlayer();
    player.statusEffects = [
      makeEffect({ id: 'fresh-1', durationMs: 5_000, startTimeTs: NOW }),
      makeEffect({ id: 'fresh-2', durationMs: 5_000, startTimeTs: NOW, type: 'slow' }),
    ];
    state.players[player.id] = player;

    advanceAll(state, new SpatialHashGrid(), 100, NOW);

    expect(state.players[player.id].statusEffects).toHaveLength(2);
  });

  it('does not mutate when the player has no status effects', () => {
    const state = createGameState();
    const player = makePlayer();
    state.players[player.id] = player;
    const before = player.statusEffects;

    advanceAll(state, new SpatialHashGrid(), 100, NOW);

    // Reference equality holds because the empty-list branch short-circuits.
    expect(state.players[player.id].statusEffects).toBe(before);
  });

  it('prunes status effects on moving and stationary players alike', () => {
    const state = createGameState();
    const moving = makePlayer();
    moving.id = 'mover';
    moving.movement = { isMoving: true, targetPos: { x: 10, z: 0 }, lastUpdateTime: NOW, speed: 5 };
    moving.velocity = { x: 5, z: 0 };
    moving.statusEffects = [makeEffect({ id: 'expired', durationMs: 100, startTimeTs: NOW - 500 })];

    const standing = makePlayer();
    standing.id = 'stander';
    standing.socketId = 's2';
    standing.statusEffects = [makeEffect({ id: 'expired', durationMs: 100, startTimeTs: NOW - 500 })];

    state.players[moving.id] = moving;
    state.players[standing.id] = standing;

    advanceAll(state, new SpatialHashGrid(), 100, NOW);

    expect(state.players.mover.statusEffects).toEqual([]);
    expect(state.players.stander.statusEffects).toEqual([]);
  });
});
