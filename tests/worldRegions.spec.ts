import { describe, expect, test } from 'vitest';
import type { ZoneManager } from '../packages/content/zones';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  createServerOwnedRegions,
  getWorldRegionStats,
  refreshWorldRegionRuntime,
} from '../server/world/regions';
import { createEnemy } from '../server/enemies/enemyLifecycle';

describe('server-owned world regions', () => {
  test('selects active regions from server policy without player input', () => {
    const regions = createServerOwnedRegions(makeZoneManager(['zone-a', 'zone-b', 'zone-c']), {
      maxActiveZones: 2,
      maxEnemiesPerZone: 4,
    });

    expect(regions.map((region) => [region.id, region.active])).toEqual([
      ['zone-a', true],
      ['zone-b', true],
      ['zone-c', false],
    ]);
  });

  test('refreshes player memberships and reports enemy counts by region', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket-1', 'Tester');
    player.position = { x: 10, y: 0.5, z: 0 };
    const enemy = createEnemy('goblin', 1, { x: 15, y: 0.5, z: 0 }, 1);

    state.players[player.id] = player;
    state.enemies[enemy.id] = enemy;
    state.zones.enemyZoneIds[enemy.id] = 'zone-a';

    const regions = createServerOwnedRegions(makeZoneManager(['zone-a', 'zone-b']), {
      maxActiveZones: 1,
      maxEnemiesPerZone: 4,
    });
    refreshWorldRegionRuntime(state, regions);

    expect(state.zones.activeZoneIds).toEqual(['zone-a']);
    expect(state.zones.playerZoneIds[player.id]).toBe('zone-a');
    expect(getWorldRegionStats(state, regions)).toContainEqual(expect.objectContaining({
      id: 'zone-a',
      playerCount: 1,
      enemyCount: 1,
      aliveEnemyCount: 1,
    }));
  });
});

function makeZoneManager(zoneIds: string[]): ZoneManager {
  return {
    getZones: () => zoneIds.map((id, index) => ({
      id,
      name: id,
      description: id,
      position: { x: index * 100, y: 0, z: 0 },
      radius: 50,
      minLevel: 1,
      maxLevel: 1,
      mobs: [],
    })),
  } as unknown as ZoneManager;
}
