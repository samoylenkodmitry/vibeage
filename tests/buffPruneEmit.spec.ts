import { describe, expect, it } from 'vitest';
import { advanceAll } from '../server/movement/worldMovement';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { GameState } from '../server/gameState';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const T0 = 1_700_000_000_000;

function makePlayer(): PlayerState {
  return {
    id: 'p1',
    socketId: 'p1-s',
    name: 'Tester',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'rogue',
    unlockedSkills: ['vanish'],
    skillShortcuts: [],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [
      { id: 'eff1', type: 'invisible', value: 1, durationMs: 6000, startTimeTs: T0, sourceSkill: 'vanish' },
    ],
    level: 7,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

function makeState(player: PlayerState): GameState {
  return {
    players: { [player.id]: player },
    enemies: {},
    activeCasts: {},
    groundLoot: {},
    zones: { activeZoneIds: [], playerZoneIds: {}, enemyZoneIds: {} },
    learnSkillRejections: [],
  } as unknown as GameState;
}

describe('PR LL — stale buff prune emits to clients', () => {
  it('emits playerUpdated with the pruned statusEffects array when an invisible buff expires', () => {
    const player = makePlayer();
    const state = makeState(player);
    const spatial = new SpatialHashGrid(50);
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => { events.push(e); } };

    // First tick well within the buff window — no emit, buff still on.
    advanceAll(state, spatial, 50, T0 + 2000, outbound);
    expect(player.statusEffects.some((e) => e.type === 'invisible')).toBe(true);
    expect(events).toEqual([]);

    // Tick past the 6s expiry — buff pruned + playerUpdated emitted.
    advanceAll(state, spatial, 50, T0 + 7000, outbound);
    expect(player.statusEffects.some((e) => e.type === 'invisible')).toBe(false);
    const updates = events.filter((e) => e.type === 'playerUpdated');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      type: 'playerUpdated',
      update: { id: 'p1', statusEffects: [] },
    });
  });
});
