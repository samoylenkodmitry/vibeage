import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type {
  EnemyEntity,
  GameClientState,
  PlayerEntity,
} from '../apps/client/src/gameTypes';

/**
 * ROADMAP — reducer tests for snapshot resync.
 *
 * A `gameState` action delivers a full server snapshot (used at join
 * time and during resync). Unlike incremental `playerUpdated` /
 * `enemyUpdated`, a snapshot fully replaces `state.players` and
 * `state.enemies` — any entity not in the new snapshot is *gone*.
 *
 * That's the resync property the player notices: when the client
 * reconnects after a network blip, dead/streamed-out entities and
 * stale players don't linger in the world.
 *
 * Pin:
 *  - stale entities not in the new snapshot are pruned
 *  - new entities appear
 *  - selectedTargetId survives if still in the snapshot, clears if not
 *  - local inventory + maxInventorySlots pulled from the snapshot's
 *    own player record
 *  - streamedRegionIds derived from the snapshot's zone maps
 */

const ME = 'me';

function makePlayer(id: string, overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id,
    name: id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    isAlive: true,
    inventory: [],
    maxInventorySlots: 20,
    unlockedSkills: [],
    skillLevels: {},
    ...overrides,
  } as unknown as PlayerEntity;
}

function makeEnemy(id: string, overrides: Partial<EnemyEntity> = {}): EnemyEntity {
  return {
    id,
    type: 'slime',
    name: 'Slime',
    level: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 50,
    maxHealth: 50,
    isAlive: true,
    ...overrides,
  } as unknown as EnemyEntity;
}

function dispatchSnapshot(
  state: GameClientState,
  snapshot: Parameters<typeof gameClientReducer>[1] & { type: 'gameState' } extends { state: infer S } ? S : never,
): GameClientState {
  return gameClientReducer(state, { type: 'gameState', state: snapshot });
}

describe('gameClientReducer — snapshot resync, entity churn', () => {
  it('prunes players and enemies that are NOT in the new snapshot', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME), stalePlayer: makePlayer('stalePlayer') },
      enemies: { e1: makeEnemy('e1'), staleEnemy: makeEnemy('staleEnemy') },
    };
    const after = dispatchSnapshot(before, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
    });
    expect(after.players.stalePlayer).toBeUndefined();
    expect(after.enemies.staleEnemy).toBeUndefined();
    expect(after.players[ME]).toBeDefined();
    expect(after.enemies.e1).toBeDefined();
  });

  it('adds players / enemies introduced by the snapshot', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME) },
      enemies: {},
    };
    const after = dispatchSnapshot(before, {
      players: { [ME]: makePlayer(ME), newcomer: makePlayer('newcomer') },
      enemies: { e1: makeEnemy('e1') },
    });
    expect(after.players.newcomer).toBeDefined();
    expect(after.enemies.e1).toBeDefined();
  });

});

describe('gameClientReducer — snapshot resync, selection + inventory', () => {
  it('selectedTargetId survives a resync when the target is still in the snapshot', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
      selectedTargetId: 'e1',
    };
    const after = dispatchSnapshot(before, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
    });
    expect(after.selectedTargetId).toBe('e1');
  });

  it('selectedTargetId clears when the target is gone from the snapshot', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
      selectedTargetId: 'e1',
    };
    const after = dispatchSnapshot(before, {
      players: { [ME]: makePlayer(ME) },
      enemies: {},
    });
    expect(after.selectedTargetId).toBeNull();
  });

  it('pulls inventory + maxInventorySlots from the snapshot\'s own player record', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME) },
      inventory: [{ itemId: 'rusty_sword', quantity: 1 }],
      maxInventorySlots: 20,
    };
    const after = dispatchSnapshot(before, {
      players: {
        [ME]: makePlayer(ME, {
          inventory: [{ itemId: 'health_potion', quantity: 4 }],
          maxInventorySlots: 30,
        }),
      },
      enemies: {},
    });
    expect(after.inventory).toEqual([{ itemId: 'health_potion', quantity: 4 }]);
    expect(after.maxInventorySlots).toBe(30);
  });

});

describe('gameClientReducer — snapshot resync, region + identity', () => {
  it('derives streamedRegionIds from the snapshot\'s zone maps', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME) },
      enemies: {},
    };
    const after = dispatchSnapshot(before, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
      zones: {
        playerZoneIds: { [ME]: 'starter-field' },
        enemyZoneIds: { e1: 'whispering-pines' },
      },
    });
    expect(after.streamedRegionIds).toEqual(['starter-field', 'whispering-pines']);
  });

  it('an empty snapshot during resync wipes players and enemies without crashing', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME), other: makePlayer('other') },
      enemies: { e1: makeEnemy('e1') },
    };
    const after = dispatchSnapshot(before, {
      players: {},
      enemies: {},
    });
    expect(after.players).toEqual({});
    expect(after.enemies).toEqual({});
  });

  it('does not clobber connectionState or myPlayerId during resync', () => {
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME) },
    };
    const after = dispatchSnapshot(before, { players: { [ME]: makePlayer(ME) }, enemies: {} });
    expect(after.connectionState).toBe('online');
    expect(after.myPlayerId).toBe(ME);
  });

  it('heals a degraded self snapshot (relogin race ships self through the public filter)', () => {
    // A zombie session can briefly own the player during a relogin, so the
    // server snapshots YOUR player via PUBLIC_PLAYER_FIELDS — owner-only
    // fields (unlockedSkills, skillLevels, inventory, …) vanish. This
    // crashed the whole client (unlockedSkills.length). The reducer must
    // keep the fresh public fields and fill owner fields from the previous
    // self.
    const before: GameClientState = {
      ...initialGameClientState,
      myPlayerId: ME,
      connectionState: 'online' as const,
      players: { [ME]: makePlayer(ME, { unlockedSkills: ['fireball'], level: 7 } as Partial<PlayerEntity>) },
    };
    const publicSelf = makePlayer(ME, { level: 8 });
    delete (publicSelf as Record<string, unknown>).unlockedSkills;
    delete (publicSelf as Record<string, unknown>).skillLevels;
    delete (publicSelf as Record<string, unknown>).inventory;

    const after = dispatchSnapshot(before, { players: { [ME]: publicSelf }, enemies: {} });

    expect(after.players[ME].unlockedSkills).toEqual(['fireball']); // owner field healed
    expect(after.players[ME].level).toBe(8); // fresh public field kept
    expect(after.players[ME].skillLevels).toEqual({});
  });
});
