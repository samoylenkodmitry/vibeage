import { describe, expect, test, vi } from 'vitest';
import { ENEMY_RESPAWN_DELAY_MS, createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createWorldTickRunner } from '../server/world/tickPipeline';

describe('world tick pipeline maintenance scheduling', () => {
  test('runs mana regeneration and enemy respawn when snapshots run every tick', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const player = createTransientPlayer('socket-1', 'TickTester');
    const enemy = createEnemy('goblin', 1, { x: 4, y: 0.5, z: 7 }, 123);
    const now = 100_000;

    player.id = 'player-1';
    player.mana = 90;
    enemy.isAlive = false;
    enemy.health = 0;
    enemy.deathTimeTs = now - ENEMY_RESPAWN_DELAY_MS;
    state.players[player.id] = player;
    state.enemies[enemy.id] = enemy;

    const runner = createWorldTickRunner({
      state,
      spatial,
      outbound,
      tickMs: 1000 / 30,
      snapHz: 30,
    });

    runner.tick(now);

    expect(player.mana).toBe(92);
    expect(enemy.isAlive).toBe(true);
    expect(enemy.health).toBe(enemy.maxHealth);
  });

  test('keeps the default staggered maintenance cadence independent from snapshots', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const player = createTransientPlayer('socket-1', 'TickTester');
    const enemy = createEnemy('goblin', 1, { x: 4, y: 0.5, z: 7 }, 123);
    const now = 100_000;

    player.id = 'player-1';
    player.mana = 90;
    enemy.isAlive = false;
    enemy.health = 0;
    enemy.deathTimeTs = now - ENEMY_RESPAWN_DELAY_MS;
    state.players[player.id] = player;
    state.enemies[enemy.id] = enemy;

    const runner = createWorldTickRunner({
      state,
      spatial,
      outbound,
      tickMs: 1000 / 30,
      snapHz: 10,
    });

    runner.tick(now);
    expect(player.mana).toBe(92);
    expect(enemy.isAlive).toBe(false);

    runner.tick(now + 1000 / 30);
    expect(enemy.isAlive).toBe(true);
  });
});

describe('world tick pipeline region activation', () => {
  test('does not run enemy AI for inactive regions', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const player = createTransientPlayer('socket-1', 'TickTester');
    const enemy = createEnemy('goblin', 1, { x: 1, y: 0.5, z: 0 }, 123);

    player.id = 'player-1';
    player.position = { x: 0, y: 0.5, z: 0 };
    enemy.targetId = player.id;
    enemy.aiState = 'attacking';
    enemy.attackCooldownMs = 0;
    state.players[player.id] = player;
    state.enemies[enemy.id] = enemy;
    state.zones.enemyZoneIds[enemy.id] = 'inactive-zone';
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });

    const runner = createWorldTickRunner({
      state,
      spatial,
      outbound,
      tickMs: 1000 / 30,
      snapHz: 30,
      regionActivationPolicy: {
        maxActiveZones: 1,
        anchorRegionId: 'active-zone',
        frontierNeighborCount: 0,
        frontierMargin: 0,
      },
      regions: [
        {
          id: 'active-zone',
          zoneId: 'active-zone',
          name: 'active-zone',
          center: { x: 0, y: 0, z: 0 },
          radius: 50,
          active: true,
          maxEnemies: 4,
        },
        {
          id: 'inactive-zone',
          zoneId: 'inactive-zone',
          name: 'inactive-zone',
          center: { x: 300, y: 0, z: 0 },
          radius: 50,
          active: false,
          maxEnemies: 4,
        },
      ],
    });

    runner.tick(100_000);

    expect(player.health).toBe(player.maxHealth);
    expect(outbound.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EnemyAttack' }));
  });
});
