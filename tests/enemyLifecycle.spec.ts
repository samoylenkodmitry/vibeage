import { describe, expect, test, vi } from 'vitest';
import type { ZoneManager } from '../packages/content/zones';
import { createGameState } from '../server/gameState';
import {
  createEnemy,
  ENEMY_RESPAWN_DELAY_MS,
  respawnDeadEnemies,
  spawnInitialEnemies,
} from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

describe('enemy lifecycle', () => {
  test('creates enemies with level-scaled combat stats and loot table id', () => {
    const enemy = createEnemy('wolf', 3, { x: 5, y: 0.5, z: -2 }, 12345);

    expect(enemy).toMatchObject({
      id: 'wolf-1bvd1n7',
      type: 'wolf',
      name: 'Wolf',
      level: 3,
      health: 160,
      maxHealth: 160,
      attackDamage: 16,
      baseExperienceValue: 80,
      experienceValue: 80,
      aiState: 'idle',
      aggroRadius: 15,
      attackCooldownMs: 2000,
      movementSpeed: 6,
      velocity: { x: 0, z: 0 },
      lootTableId: 'wolf_loot',
    });
  });

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
    } as unknown as ZoneManager;

    const spawned = spawnInitialEnemies(state, spatial, zoneManager);
    const enemyIds = Object.keys(state.enemies);

    expect(spawned).toBe(2);
    expect(enemyIds).toHaveLength(2);
    expect(spatial.queryCircle({ x: 1, z: 1 }, 1)).toContain(enemyIds[0]);
    expect(spatial.queryCircle({ x: 8, z: 1 }, 1)).toContain(enemyIds[1]);
  });

  test('respawns dead enemies after the respawn delay', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const now = 100_000;
    const enemy = createEnemy('goblin', 2, { x: 4, y: 0.5, z: 7 }, 123);
    enemy.isAlive = false;
    enemy.health = 0;
    enemy.position = { x: 40, y: 0.5, z: 40 };
    enemy.targetId = 'player1';
    enemy.statusEffects = [{ id: 'slow', type: 'slow', value: 1, startTimeTs: 1, durationMs: 10, sourceSkill: 'test' }];
    enemy.deathTimeTs = now - ENEMY_RESPAWN_DELAY_MS;
    state.enemies[enemy.id] = enemy;

    const respawned = respawnDeadEnemies(state, spatial, outbound, now);

    expect(respawned).toBe(1);
    expect(enemy).toMatchObject({
      isAlive: true,
      health: enemy.maxHealth,
      position: enemy.spawnPosition,
      targetId: null,
      statusEffects: [],
    });
    expect(spatial.queryCircle({ x: 4, z: 7 }, 1)).toContain(enemy.id);
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'enemyUpdated',
      update: enemy,
    });
  });
});
