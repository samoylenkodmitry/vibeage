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
