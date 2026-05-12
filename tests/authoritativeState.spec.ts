import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';

describe('authoritative game state model', () => {
  test('creates explicit server-owned state buckets', () => {
    const state = createGameState();

    expect(state.players).toEqual({});
    expect(state.enemies).toEqual({});
    expect(state.activeCasts).toEqual({});
    expect(state.effectsByTarget).toEqual({});
    expect(state.projectiles).toEqual([]);
    expect(state.lastProjectileId).toBe(0);
    expect(state.groundLoot).toEqual({});
    expect(state.zones).toEqual({
      activeZoneIds: [],
      playerZoneIds: {},
      enemyZoneIds: {},
    });
  });
});
