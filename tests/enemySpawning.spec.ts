import { describe, expect, test } from 'vitest';
import type { ZoneManager } from '../packages/content/zones';
import { createGameState } from '../server/gameState';
import { spawnInitialEnemies } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

describe('enemy spawning', () => {
  test('spawns zone enemies into state and spatial index', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const positions = [
      { x: 1, y: 0.5, z: 1 },
      { x: 8, y: 0.5, z: 1 },
    ];
    const zoneManager = {
      getZones: () => [{ id: 'test-zone' }],
      getMobsToSpawn: () => [{ type: 'goblin', count: 2 }],
      getRandomPositionInZone: () => positions.shift() ?? null,
      getMobLevel: () => 2,
      getMiniBoss: () => null,
    } as unknown as ZoneManager;

    const spawned = spawnInitialEnemies(state, spatial, zoneManager);
    const enemyIds = Object.keys(state.enemies);

    expect(spawned).toBe(2);
    expect(enemyIds).toHaveLength(2);
    expect(spatial.queryCircle({ x: 1, z: 1 }, 1)).toContain(enemyIds[0]);
    expect(spatial.queryCircle({ x: 8, z: 1 }, 1)).toContain(enemyIds[1]);
  });

  test('caps initial spawns for scale budgets', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    let nextPosition = 0;
    const zoneManager = {
      getZones: () => [{ id: 'test-zone' }],
      getMobsToSpawn: () => [{ type: 'goblin', count: 5 }],
      getRandomPositionInZone: () => {
        nextPosition += 1;
        return { x: nextPosition, y: 0.5, z: nextPosition };
      },
      getMobLevel: () => 2,
      getMiniBoss: () => null,
    } as unknown as ZoneManager;

    const spawned = spawnInitialEnemies(state, spatial, zoneManager, { maxEnemies: 3 });

    expect(spawned).toBe(3);
    expect(Object.keys(state.enemies)).toHaveLength(3);
  });

  test('spawns only server-active zones without depending on any player', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.zones.activeZoneIds = ['zone-b'];
    let nextPosition = 20;
    const zoneManager = {
      getZones: () => [{ id: 'zone-a' }, { id: 'zone-b' }],
      getMobsToSpawn: (zoneId: string) => [{ type: zoneId === 'zone-b' ? 'wolf' : 'goblin', count: 2 }],
      getRandomPositionInZone: (zoneId: string) => {
        nextPosition += 1;
        return { x: zoneId === 'zone-b' ? nextPosition : 1, y: 0.5, z: 2 };
      },
      getMobLevel: () => 2,
      getMiniBoss: () => null,
    } as unknown as ZoneManager;

    const spawned = spawnInitialEnemies(state, spatial, zoneManager);
    const enemies = Object.values(state.enemies);

    expect(spawned).toBe(2);
    expect(Object.keys(state.players)).toHaveLength(0);
    expect(enemies.map((enemy) => enemy.type)).toEqual(['wolf', 'wolf']);
    expect(enemies.map((enemy) => enemy.position.x)).toEqual([21, 22]);
    expect(Object.values(state.zones.enemyZoneIds)).toEqual(['zone-b', 'zone-b']);
  });

  test('spawns a mini-boss before regular mobs when configured', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    let nextPosition = 0;
    const zoneManager = {
      getZones: () => [{ id: 'zone-a' }],
      getMobsToSpawn: () => [{ type: 'goblin', count: 0 }],
      getRandomPositionInZone: () => {
        nextPosition += 1;
        return { x: nextPosition, y: 0.5, z: 1 };
      },
      getMobLevel: () => 5,
      getMiniBoss: () => ({
        type: 'troll',
        name: 'Hammerback',
        levelBonus: 2,
        healthMultiplier: 3,
        damageMultiplier: 1.5,
      }),
    } as unknown as ZoneManager;

    spawnInitialEnemies(state, spatial, zoneManager, { activeZoneIds: ['zone-a'] });
    const enemies = Object.values(state.enemies);
    const boss = enemies.find((enemy) => enemy.isMiniBoss);

    expect(boss).toBeDefined();
    expect(boss?.name).toBe('Hammerback');
    expect(boss?.level).toBe(7);
  });

  test('groups pack mobs into clusters with shared packId', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    let nextPosition = 0;
    const zoneManager = {
      getZones: () => [{ id: 'zone-a' }],
      getMobsToSpawn: () => [{ type: 'wolf', count: 6, packSize: 3 }],
      getRandomPositionInZone: () => {
        nextPosition += 100;
        return { x: nextPosition, y: 0.5, z: 1 };
      },
      getMobLevel: () => 1,
      getMiniBoss: () => null,
    } as unknown as ZoneManager;

    spawnInitialEnemies(state, spatial, zoneManager, { activeZoneIds: ['zone-a'] });
    const enemies = Object.values(state.enemies);
    const packIds = new Set(enemies.map((enemy) => enemy.packId));

    expect(enemies).toHaveLength(6);
    expect([...packIds].filter((id) => id !== undefined)).toHaveLength(2);
  });

  test('caps each active zone independently from the global enemy cap', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    let nextPosition = 0;
    const zoneManager = {
      getZones: () => [{ id: 'zone-a' }, { id: 'zone-b' }],
      getMobsToSpawn: () => [{ type: 'goblin', count: 5 }],
      getRandomPositionInZone: () => {
        nextPosition += 1;
        return { x: nextPosition, y: 0.5, z: 1 };
      },
      getMobLevel: () => 2,
      getMiniBoss: () => null,
    } as unknown as ZoneManager;

    const spawned = spawnInitialEnemies(state, spatial, zoneManager, {
      activeZoneIds: ['zone-a', 'zone-b'],
      maxEnemies: 10,
      maxEnemiesPerZone: 3,
    });

    expect(spawned).toBe(6);
    expect(Object.values(state.zones.enemyZoneIds).filter((zoneId) => zoneId === 'zone-a')).toHaveLength(3);
    expect(Object.values(state.zones.enemyZoneIds).filter((zoneId) => zoneId === 'zone-b')).toHaveLength(3);
  });
});
