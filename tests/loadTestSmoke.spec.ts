import { describe, expect, it, beforeEach } from 'vitest';
import { ZoneManager } from '../packages/content/zones';
import { spawnInitialEnemies } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createWorldTickRunner } from '../server/world/tickPipeline';
import {
  DEFAULT_WORLD_ZONE_SPAWN_POLICY,
  initializeServerDrivenZoneRuntime,
} from '../server/world/zoneRuntime';

/**
 * §52 #12 — smoke coverage for the in-process load test scaffold.
 *
 * The `scripts/load-test-inprocess.ts` entry point is the operator-
 * facing CLI; this test exercises the same code path (tick runner +
 * N bot players + a no-op outbound) at a tiny scale so:
 *
 *   1. CI catches regressions if the tick runner / spawn budget /
 *      runtimeMetrics shape drifts in a way that would break the
 *      load script.
 *   2. The histograms the script reports actually populate during a
 *      few ticks (`snapshot.batchSize` is the canonical signal — if
 *      it's zero across 60 ticks, the snapshot phase silently
 *      stopped firing).
 *
 * Keeps the run very small (5 bots, 60 ticks) so this stays a
 * sub-second unit test, not a benchmark.
 */

describe('load-test in-process scaffold (§52 #12)', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('boots a world, spawns enemies, runs the tick runner with N bot players, and records histograms', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const zoneManager = new ZoneManager();
    initializeServerDrivenZoneRuntime(state, zoneManager, DEFAULT_WORLD_ZONE_SPAWN_POLICY);
    const spawnedEnemies = spawnInitialEnemies(state, spatial, zoneManager, {
      activeZoneIds: state.zones.activeZoneIds,
      maxEnemies: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveEnemies,
      maxEnemiesPerZone: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxEnemiesPerZone,
    });
    expect(spawnedEnemies).toBeGreaterThan(0);

    const N = 5;
    for (let i = 0; i < N; i += 1) {
      const player = createTransientPlayer(`smoke-socket-${i}`, `Smoke${i}`);
      player.id = `smoke-bot-${i}`;
      player.position = { x: i * 2, y: 0.5, z: 0 };
      state.players[player.id] = player;
      spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    }

    const runner = createWorldTickRunner({
      state,
      spatial,
      outbound: { publish: () => undefined },
      tickMs: 1000 / 30,
      snapHz: 10,
    });

    const ticks = 60;
    let now = Date.now();
    for (let t = 0; t < ticks; t += 1) {
      runner.tick(now);
      now += 1000 / 30;
    }

    const metrics = runtimeMetrics.snapshot();
    // Tick-cost percentiles populate.
    expect(metrics.tickMs.samples).toBeGreaterThanOrEqual(60);
    expect(metrics.tickMs.p50).toBeGreaterThanOrEqual(0);
    // Snapshot phase fires (60 ticks @ 1000/30 ms * 10Hz snap → ~20 batches).
    const batchHistogram = metrics.histograms['snapshot.batchSize'];
    expect(batchHistogram).toBeDefined();
    expect(batchHistogram.samples).toBeGreaterThan(0);
    // Sanity: counters incremented to match.
    expect(metrics.counters['snapshot.batches']).toBeGreaterThan(0);
    expect(metrics.counters['snapshot.updates']).toBeGreaterThan(0);
  });

  it('keeps tick cost sane at 5 bots (regression net — single tick should be well under the budget)', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const zoneManager = new ZoneManager();
    initializeServerDrivenZoneRuntime(state, zoneManager, DEFAULT_WORLD_ZONE_SPAWN_POLICY);
    spawnInitialEnemies(state, spatial, zoneManager, {
      activeZoneIds: state.zones.activeZoneIds,
      maxEnemies: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveEnemies,
      maxEnemiesPerZone: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxEnemiesPerZone,
    });
    for (let i = 0; i < 5; i += 1) {
      const player = createTransientPlayer(`bot-${i}`, `Bot${i}`);
      player.id = `bot-${i}`;
      state.players[player.id] = player;
      spatial.insert(player.id, { x: 0, z: 0 });
    }

    const runner = createWorldTickRunner({
      state, spatial,
      outbound: { publish: () => undefined },
      tickMs: 1000 / 30,
      snapHz: 10,
    });
    for (let t = 0; t < 30; t += 1) runner.tick(Date.now() + t * 33);

    // 33ms tick budget (30Hz). p95 should be well under that even on
    // slow CI; we use a generous 100ms to avoid flakes on shared runners.
    const tickMs = runtimeMetrics.snapshot().tickMs;
    expect(tickMs.p95).toBeLessThan(100);
  });
});
