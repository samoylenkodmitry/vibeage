import { describe, expect, test, vi } from 'vitest';
import { ENEMY_RESPAWN_DELAY_MS, createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createWorldTickRunner } from '../server/world/tickPipeline';
import { handleCastReq } from '../server/combat/castHandler';
import { createWorldCombatBridge } from '../server/world/clientMessageRouter';
import { createSimulatedPlayer } from '../server/sim/gameSimulator';
import type { OutboundEvent } from '../server/transport/outboundEvents';

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
    // Pre-seed regen clock so the maintenance tick actually applies
    // regen instead of just seeding lastRegenTimeMs on first sight.
    player.lastRegenTimeMs = now - 1000;
    // Pin mpRegen so the assertion is independent of class stat tuning.
    player.stats = { ...(player.stats ?? {}), hpRegen: 2, mpRegen: 2 };
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
    player.lastRegenTimeMs = now - 1000;
    player.stats = { ...(player.stats ?? {}), hpRegen: 2, mpRegen: 2 };
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

describe('world tick pipeline teleport snapshots', () => {
  test('Dimensional Swap emits hard-snap PosSnap updates through the production tick', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const events: OutboundEvent[] = [];
    const outbound = { publish: (event: OutboundEvent) => events.push(event) };
    const direct = { send: vi.fn() };
    const now = 100_000;
    const player = createSimulatedPlayer({
      id: 'swapper',
      socketId: 'socket-1',
      className: 'mage',
      level: 40,
      specializationId: 'arcanist',
      unlockedSkills: ['dimensional_swap'],
      position: { x: 0, z: 0 },
    });
    const enemy = createEnemy('goblin', 40, { x: 8, y: 0.5, z: 0 }, now);
    enemy.id = 'target';
    enemy.health = 10_000;
    enemy.maxHealth = 10_000;
    state.players[player.id] = player;
    state.enemies[enemy.id] = enemy;
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });

    handleCastReq(
      { id: player.socketId },
      player,
      { type: 'CastReq', id: player.id, skillId: 'dimensional_swap', targetId: enemy.id, clientTs: now },
      { direct, outbound },
      createWorldCombatBridge(state, outbound, spatial),
      { activeCasts: state.activeCasts, now },
    );
    createWorldTickRunner({ state, spatial, outbound, tickMs: 1000 / 30, snapHz: 30 }).tick(now + 1000 / 30);

    const posSnaps = events
      .filter((event) => event.type === 'serverMessage' && event.message.type === 'BatchUpdate')
      .flatMap((event) => event.type === 'serverMessage' && event.message.type === 'BatchUpdate' ? event.message.updates : [])
      .filter((message) => message.type === 'PosSnap');
    const playerSnap = posSnaps.find((message) => message.id === player.id);
    const enemySnap = posSnaps.find((message) => message.id === enemy.id);
    expect(player.position.x).toBeCloseTo(8, 4);
    expect(enemy.position.x).toBeCloseTo(0, 4);
    expect(playerSnap).toMatchObject({ id: player.id, pos: { x: 8, z: 0 }, snap: true });
    expect(enemySnap).toMatchObject({ id: enemy.id, pos: { x: 0, z: 0 }, snap: true });
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
