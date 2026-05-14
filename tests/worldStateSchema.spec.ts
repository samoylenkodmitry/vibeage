import { describe, expect, test } from 'vitest';
import { Encoder } from '@colyseus/schema';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  createVibeAgePublicState,
  syncVibeAgePublicState,
} from '../server/transport/worldStateSchema';
import type { ServerWorldRegion } from '../server/world/regions';

describe('Colyseus public world state', () => {
  test('syncs aggregate region state without owner-only player data', () => {
    const gameState = createGameState();
    const player = createTransientPlayer('socket-1', 'Tester');
    const enemy = createEnemy('goblin', 1, { x: 2, y: 0.5, z: 3 }, 1);
    gameState.players[player.id] = player;
    gameState.enemies[enemy.id] = enemy;
    gameState.zones.playerZoneIds[player.id] = 'starter';
    gameState.zones.enemyZoneIds[enemy.id] = 'starter';

    const publicState = createVibeAgePublicState();
    syncVibeAgePublicState(publicState, gameState, [makeRegion('starter', true)]);

    expect(publicState.playerCount).toBe(1);
    expect(publicState.enemyCount).toBe(1);
    expect(publicState.aliveEnemyCount).toBe(1);
    expect(publicState.activeRegionCount).toBe(1);
    expect(publicState.regions.get('starter')).toMatchObject({
      id: 'starter',
      playerCount: 1,
      enemyCount: 1,
      aliveEnemyCount: 1,
    });
    expect(() => new Encoder(publicState).encodeAll()).not.toThrow();
  });
});

function makeRegion(id: string, active: boolean): ServerWorldRegion {
  return {
    id,
    zoneId: id,
    name: id,
    center: { x: 0, y: 0, z: 0 },
    radius: 50,
    active,
    maxEnemies: 8,
  };
}
