import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  createEnemy,
  ENEMY_RESPAWN_DELAY_MS,
  respawnDeadEnemies,
} from '../server/enemies/enemyLifecycle';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

describe('enemy lifecycle', () => {
  test('creates enemies with level-scaled combat stats and loot table id', () => {
    const enemy = createEnemy('wolf', 3, { x: 5, y: 0.5, z: -2 }, 12345);

    expect(enemy).toMatchObject({
      id: 'wolf-1bvd1n7',
      type: 'wolf',
      name: 'Gray Wolf',
      level: 3,
      health: 160 * 0.85,
      maxHealth: 160 * 0.85,
      attackDamage: 16 * 1.05,
      baseExperienceValue: 64,
      experienceValue: 64,
      aiState: 'idle',
      aggroRadius: 15,
      attackCooldownMs: 2000,
      movementSpeed: 12 * 1.25,
      velocity: { x: 0, z: 0 },
      lootTableId: 'wolf_loot',
    });
  });

  test('records enemy spawn XP telemetry and flags suspicious levels', () => {
    runtimeMetrics.resetForTests();

    const enemy = createEnemy('dragon', 90, { x: 5, y: 0.5, z: -2 }, 12345, {
      isMiniBoss: true,
      bossId: 'vorthax_ember_wyrm',
    });

    const metrics = runtimeMetrics.snapshot();
    expect(metrics.counters['enemy.spawn.total']).toBe(1);
    expect(metrics.counters['enemy.spawn.miniBoss']).toBe(1);
    expect(metrics.counters['enemy.spawn.suspicious']).toBe(1);
    expect(metrics.histograms['enemy.spawn.level']?.max).toBe(90);
    expect(metrics.histograms['enemy.spawn.baseExperienceValue']?.max).toBe(enemy.baseExperienceValue);
    expect(metrics.histograms['enemy.spawn.experienceMultiplier']?.max).toBe(4);
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

  test('does not respawn enemies from inactive global zones', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const now = 100_000;
    const enemy = createEnemy('goblin', 2, { x: 4, y: 0.5, z: 7 }, 123);
    enemy.isAlive = false;
    enemy.deathTimeTs = now - ENEMY_RESPAWN_DELAY_MS;
    state.enemies[enemy.id] = enemy;
    state.zones.activeZoneIds = ['active-zone'];
    state.zones.enemyZoneIds[enemy.id] = 'inactive-zone';

    expect(respawnDeadEnemies(state, spatial, outbound, now)).toBe(0);
    expect(enemy.isAlive).toBe(false);
    expect(outbound.publish).not.toHaveBeenCalled();
  });
});
