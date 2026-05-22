import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { EnemyEntity, GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';

/**
 * ROADMAP — reducer tests for region visibility changes.
 *
 * The client doesn't get explicit "you can now see region X" messages
 * — visibility is derived from the snapshot's `zones.playerZoneIds`
 * and `zones.enemyZoneIds` maps. Each `gameState` (full snapshot) or
 * `worldPublicState` recomputes which region IDs the player can see
 * geometry for.
 *
 * Pin the per-transition behavior the HUD relies on:
 *  - a new region appearing in the snapshot lands in streamedRegionIds
 *  - a region dropping out is pruned (player walked far away, or the
 *    server demoted it from active)
 *  - sort order is stable so the HUD's region chip doesn't flicker
 *  - duplicate region references (player + enemy in same region) only
 *    contribute one entry
 *  - missing zone maps leave streamedRegionIds empty (defensive)
 */

const ME = 'me';

function makePlayer(id: string): PlayerEntity {
  return {
    id,
    name: id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    isAlive: true,
    unlockedSkills: [],
    skillLevels: {},
  } as unknown as PlayerEntity;
}

function makeEnemy(id: string): EnemyEntity {
  return {
    id, type: 'slime', name: 'Slime', level: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 50, maxHealth: 50, isAlive: true,
  } as unknown as EnemyEntity;
}

const baseState: GameClientState = {
  ...initialGameClientState,
  myPlayerId: ME,
  connectionState: 'online' as const,
};

function dispatchSnapshot(
  state: GameClientState,
  snapshot: Parameters<typeof gameClientReducer>[1] & { type: 'gameState' } extends { state: infer S } ? S : never,
): GameClientState {
  return gameClientReducer(state, { type: 'gameState', state: snapshot });
}

describe('gameClientReducer — region visibility (snapshot-driven)', () => {
  it('adds a region as soon as it appears in zones.playerZoneIds', () => {
    const after = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: {},
      zones: { playerZoneIds: { [ME]: 'starter-field' } },
    });
    expect(after.streamedRegionIds).toEqual(['starter-field']);
  });

  it('aggregates regions from playerZoneIds AND enemyZoneIds', () => {
    const after = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
      zones: {
        playerZoneIds: { [ME]: 'starter-field' },
        enemyZoneIds: { e1: 'whispering-pines' },
      },
    });
    expect(after.streamedRegionIds).toEqual(['starter-field', 'whispering-pines']);
  });

  it('deduplicates when player + enemy share a region (no double-count)', () => {
    const after = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
      zones: {
        playerZoneIds: { [ME]: 'starter-field' },
        enemyZoneIds: { e1: 'starter-field' },
      },
    });
    expect(after.streamedRegionIds).toEqual(['starter-field']);
  });

  it('sort order is stable (sorted alphabetically) so HUD chips don\'t flicker on snapshot churn', () => {
    const after = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1'), e2: makeEnemy('e2') },
      zones: {
        playerZoneIds: { [ME]: 'whispering-pines' },
        enemyZoneIds: { e1: 'frozen-tundra', e2: 'arcane-vault' },
      },
    });
    expect(after.streamedRegionIds).toEqual([
      'arcane-vault', 'frozen-tundra', 'whispering-pines',
    ]);
  });
});

describe('gameClientReducer — region visibility transitions', () => {
  it('prunes a region that drops out of the new snapshot', () => {
    const inField = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: {},
      zones: { playerZoneIds: { [ME]: 'starter-field' } },
    });
    expect(inField.streamedRegionIds).toEqual(['starter-field']);
    // Player walks to a different region — the next snapshot's zone
    // maps no longer mention starter-field.
    const inWoods = dispatchSnapshot(inField, {
      players: { [ME]: makePlayer(ME) },
      enemies: {},
      zones: { playerZoneIds: { [ME]: 'whispering-pines' } },
    });
    expect(inWoods.streamedRegionIds).toEqual(['whispering-pines']);
  });

  it('shrinking to zero (e.g., gameplay paused or no zones in snapshot)', () => {
    const inField = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: {},
      zones: { playerZoneIds: { [ME]: 'starter-field' } },
    });
    const empty = dispatchSnapshot(inField, { players: {}, enemies: {} });
    expect(empty.streamedRegionIds).toEqual([]);
  });

  it('missing zone maps yields an empty streamedRegionIds (defensive)', () => {
    const after = dispatchSnapshot(baseState, {
      players: { [ME]: makePlayer(ME) },
      enemies: { e1: makeEnemy('e1') },
    });
    expect(after.streamedRegionIds).toEqual([]);
  });
});
