import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import {
  DOT_TICK_INTERVAL_MS,
  resetDotTrackerForTests,
  tickDamageOverTimeEffects,
} from '../server/combat/dotTicker';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function makePlayer(id: string, effects: StatusEffect[] = []): PlayerState {
  return {
    id,
    socketId: `${id}-s`,
    name: id,
    position: { x: 0, y: 0.5, z: 0 },
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
    statusEffects: effects,
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

function burnEffect(id: string, value: number, overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id,
    type: 'burn',
    value,
    durationMs: 5_000,
    startTimeTs: NOW,
    sourceSkill: 'fireball',
    ...overrides,
  };
}

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => { events.push(e); } } };
}

describe('tickDamageOverTimeEffects', () => {
  beforeEach(() => {
    resetDotTrackerForTests();
  });

  it('does not damage before the first tick interval has elapsed', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 5)]);
    state.players[player.id] = player;
    const { events, sink } = captureOutbound();

    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS - 1);

    expect(player.health).toBe(100);
    expect(events).toEqual([]);
  });

  it('applies one tick of damage at exactly DOT_TICK_INTERVAL_MS', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 5)]);
    state.players[player.id] = player;
    const { events, sink } = captureOutbound();

    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS);

    expect(player.health).toBe(95);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'playerUpdated',
      update: expect.objectContaining({ id: 'p', health: 95 }),
    }));
  });

  it('catches up on missed ticks when called late (e.g. tick stall)', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 5)]);
    state.players[player.id] = player;
    const { sink } = captureOutbound();

    // Called 3 ticks late → applies 3 ticks of damage in one call.
    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS * 3);

    expect(player.health).toBe(85);
  });

  it('stops applying ticks once the effect has expired', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 5, { durationMs: 2_500 })]);
    state.players[player.id] = player;
    const { sink } = captureOutbound();

    // Effect lasts 2500ms; only 2 ticks should land (at +1000 and +2000).
    tickDamageOverTimeEffects(state, sink, NOW + 10_000);

    expect(player.health).toBe(90);
  });

  it('kills the player when a tick reduces health to 0', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 200)]);
    state.players[player.id] = player;
    const { events, sink } = captureOutbound();

    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS);

    expect(player.health).toBe(0);
    expect(player.isAlive).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'playerUpdated',
      update: expect.objectContaining({ id: 'p', isAlive: false }),
    }));
  });

  it('also ticks DoTs on enemies and emits enemyUpdated', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    enemy.statusEffects = [burnEffect('b-enemy', 10)];
    state.enemies[enemy.id] = enemy;
    const startingHealth = enemy.health;
    const { events, sink } = captureOutbound();

    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS);

    expect(enemy.health).toBe(startingHealth - 10);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'enemyUpdated',
      update: expect.objectContaining({ id: enemy.id, health: startingHealth - 10 }),
    }));
  });

});

describe('tickDamageOverTimeEffects: non-DoT and edge cases', () => {
  beforeEach(() => {
    resetDotTrackerForTests();
  });

  it('ignores non-DoT status effects (slow / stun / shield)', () => {
    const state = createGameState();
    const player = makePlayer('p', [
      { id: 's1', type: 'slow', value: 50, durationMs: 5_000, startTimeTs: NOW, sourceSkill: 'iceBolt' },
      { id: 'st1', type: 'stun', value: 1, durationMs: 5_000, startTimeTs: NOW, sourceSkill: 'petrify' },
    ]);
    state.players[player.id] = player;
    const { events, sink } = captureOutbound();

    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS * 5);

    expect(player.health).toBe(100);
    expect(events).toEqual([]);
  });

  it('handles entity with no status effects safely', () => {
    const state = createGameState();
    const player = makePlayer('p');
    state.players[player.id] = player;
    const { sink } = captureOutbound();
    expect(() => tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS)).not.toThrow();
  });

  it('skips dead entities', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 5)]);
    player.isAlive = false;
    player.health = 0;
    state.players[player.id] = player;
    const { events, sink } = captureOutbound();

    tickDamageOverTimeEffects(state, sink, NOW + DOT_TICK_INTERVAL_MS);

    expect(events).toEqual([]);
  });

  it('uses Date.now() when no `now` is supplied', () => {
    const state = createGameState();
    const player = makePlayer('p', [burnEffect('b1', 5, { startTimeTs: 0 })]);
    state.players[player.id] = player;
    const { sink } = captureOutbound();
    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow);

    expect(() => tickDamageOverTimeEffects(state, sink)).not.toThrow();
    vi.restoreAllMocks();
  });
});
