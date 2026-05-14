import { describe, expect, test } from 'vitest';
import type { ZoneManager } from '../packages/content/zones';
import { createGameState } from '../server/gameState';
import {
  initializeServerDrivenZoneRuntime,
  isZoneActive,
  selectServerActiveZoneIds,
} from '../server/world/zoneRuntime';

describe('server-driven zone runtime', () => {
  test('selects active zones from server policy without player input', () => {
    const zoneManager = makeZoneManager(['zone-a', 'zone-b', 'zone-c']);

    expect(selectServerActiveZoneIds(zoneManager, {
      maxActiveZones: 2,
      maxActiveEnemies: 10,
      maxEnemiesPerZone: 5,
    })).toEqual(['zone-a', 'zone-b']);
  });

  test('initializes global active zones and clears stale runtime indexes', () => {
    const state = createGameState();
    state.zones.playerZoneIds.player1 = 'old-zone';
    state.zones.enemyZoneIds.enemy1 = 'old-zone';

    initializeServerDrivenZoneRuntime(state, makeZoneManager(['zone-a']), {
      maxActiveZones: 1,
      maxActiveEnemies: 10,
      maxEnemiesPerZone: 5,
    });

    expect(state.zones.activeZoneIds).toEqual(['zone-a']);
    expect(state.zones.playerZoneIds).toEqual({});
    expect(state.zones.enemyZoneIds).toEqual({});
    expect(isZoneActive(state, 'zone-a')).toBe(true);
    expect(isZoneActive(state, 'zone-b')).toBe(false);
  });
});

function makeZoneManager(zoneIds: string[]): ZoneManager {
  return {
    getZones: () => zoneIds.map((id) => ({ id })),
  } as unknown as ZoneManager;
}
