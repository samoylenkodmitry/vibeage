#!/usr/bin/env tsx
/**
 * §52 #12 part 3 — load-test sweep. Runs the in-process tick pipeline
 * at several player counts in sequence and emits a compact comparison
 * report (one row per N). Lets us see how tick cost / outbound rate /
 * memory scale as the bot count climbs, instead of running the
 * single-config CLI five times and stitching the numbers together by
 * hand.
 *
 * Each sweep step spins up a fresh GameState (zone runtime,
 * enemies, bots) and a fresh runtimeMetrics window so the steps don't
 * contaminate each other. Reusing the runner shape from
 * `load-test-inprocess.ts` (same tick / movement loop) so the two
 * stay honest.
 *
 * Usage:
 *   pnpm run load:sweep
 *   LOAD_SWEEP=10,50,100,200 LOAD_TICKS=300 pnpm run load:sweep
 *
 * Environment variables:
 *   LOAD_SWEEP        comma-separated player counts (default "10,50,100")
 *   LOAD_TICKS        ticks per step                (default 300)
 *   LOAD_TICK_MS      tick interval ms              (default 1000/30)
 *   LOAD_SNAP_HZ      snapshot Hz                   (default 10)
 *   LOAD_MOVE_INTERVAL ticks between move intents per bot (default 30)
 */
import { performance } from 'node:perf_hooks';
import { ZoneManager } from '../packages/content/zones.js';
import { spawnInitialEnemies } from '../server/enemies/enemyLifecycle.js';
import { createGameState, type GameState } from '../server/gameState.js';
import { createTransientPlayer } from '../server/playerFactory.js';
import { runtimeMetrics } from '../server/observability/runtimeMetrics.js';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid.js';
import { createWorldTickRunner } from '../server/world/tickPipeline.js';
import {
  DEFAULT_WORLD_ZONE_SPAWN_POLICY,
  initializeServerDrivenZoneRuntime,
} from '../server/world/zoneRuntime.js';

const sweep = parseSweep(process.env.LOAD_SWEEP ?? '10,50,100');
const tickCount = Number(process.env.LOAD_TICKS ?? 300);
const tickMs = Number(process.env.LOAD_TICK_MS ?? 1000 / 30);
const snapHz = Number(process.env.LOAD_SNAP_HZ ?? 10);
const moveIntervalTicks = Number(process.env.LOAD_MOVE_INTERVAL ?? 30);

const results: SweepRow[] = [];
for (const playerCount of sweep) {
  results.push(runSweepStep(playerCount));
}

console.log(JSON.stringify({
  config: { sweep, tickCount, tickMs, snapHz, moveIntervalTicks },
  results,
  summary: summarize(results),
}, null, 2));

type SweepRow = {
  playerCount: number;
  spawnedEnemies: number;
  elapsedMs: number;
  realtimeRatio: number;
  averageTickMs: number;
  tickP50: number;
  tickP95: number;
  tickP99: number;
  snapshotBatches: number;
  outboundTotal: number;
  outboundPlayerUpdated: number;
  outboundEnemyUpdated: number;
  batchedPosSnap: number;
  rssDeltaKB: number;
  heapDeltaKB: number;
};

function runSweepStep(playerCount: number): SweepRow {
  // Force GC between steps if --expose-gc is set so memory deltas
  // mean something. No-op when --expose-gc is not passed.
  globalThis.gc?.();
  runtimeMetrics.resetForTests();

  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const zoneManager = new ZoneManager();
  initializeServerDrivenZoneRuntime(state, zoneManager, DEFAULT_WORLD_ZONE_SPAWN_POLICY);
  const spawnedEnemies = spawnInitialEnemies(state, spatial, zoneManager, {
    activeZoneIds: state.zones.activeZoneIds,
    maxEnemies: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveEnemies,
    maxEnemiesPerZone: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxEnemiesPerZone,
  });
  seedBots(state, spatial, playerCount);

  const runner = createWorldTickRunner({
    state, spatial,
    outbound: { publish: () => undefined },
    tickMs, snapHz,
  });

  const memBefore = process.memoryUsage();
  const startedAt = performance.now();
  let now = Date.now();
  for (let t = 0; t < tickCount; t += 1) {
    if (moveIntervalTicks > 0 && t % moveIntervalTicks === 0) {
      throwMovementIntents(state, t, now);
    }
    runner.tick(now);
    now += tickMs;
  }
  const elapsedMs = performance.now() - startedAt;
  const memAfter = process.memoryUsage();
  const metrics = runtimeMetrics.snapshot();

  return {
    playerCount,
    spawnedEnemies,
    elapsedMs: round(elapsedMs),
    realtimeRatio: round(elapsedMs / (tickCount * tickMs)),
    averageTickMs: round(elapsedMs / tickCount),
    tickP50: round(metrics.tickMs.p50),
    tickP95: round(metrics.tickMs.p95),
    tickP99: round(metrics.tickMs.p99),
    snapshotBatches: metrics.counters['snapshot.batches'] ?? 0,
    outboundTotal: metrics.counters['outbound.total'] ?? 0,
    outboundPlayerUpdated: metrics.counters['outbound.playerUpdated'] ?? 0,
    outboundEnemyUpdated: metrics.counters['outbound.enemyUpdated'] ?? 0,
    batchedPosSnap: metrics.counters['outbound.batched.PosSnap'] ?? 0,
    rssDeltaKB: kb(memAfter.rss - memBefore.rss),
    heapDeltaKB: kb(memAfter.heapUsed - memBefore.heapUsed),
  };
}

function seedBots(state: GameState, spatial: SpatialHashGrid, playerCount: number): void {
  for (let i = 0; i < playerCount; i += 1) {
    const player = createTransientPlayer(`sweep-${playerCount}-${i}`, `SweepBot${i}`);
    player.id = `sweep-${playerCount}-${i}`;
    const angle = (i / playerCount) * Math.PI * 2;
    const radius = 5 + (i % 20);
    player.position = { x: Math.cos(angle) * radius, y: 0.5, z: Math.sin(angle) * radius };
    state.players[player.id] = player;
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
  }
}

function throwMovementIntents(state: GameState, tick: number, now: number): void {
  for (const playerId in state.players) {
    const player = state.players[playerId];
    const offset = ((tick / moveIntervalTicks) % 4) * (Math.PI / 2);
    player.movement = {
      targetPos: {
        x: player.position.x + Math.cos(offset) * 2,
        z: player.position.z + Math.sin(offset) * 2,
      },
      isMoving: true,
      lastUpdateTime: now,
      speed: 5,
    };
  }
}

function summarize(rows: SweepRow[]): {
  scalingNotes: string[];
} {
  const notes: string[] = [];
  if (rows.length < 2) return { scalingNotes: notes };
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const playerMul = curr.playerCount / prev.playerCount;
    const tickMul = prev.averageTickMs > 0 ? curr.averageTickMs / prev.averageTickMs : NaN;
    const outboundMul = prev.outboundTotal > 0 ? curr.outboundTotal / prev.outboundTotal : NaN;
    notes.push(
      `${prev.playerCount} → ${curr.playerCount} bots (${playerMul.toFixed(1)}x): ` +
      `tick ${tickMul.toFixed(2)}x, outbound ${outboundMul.toFixed(2)}x`,
    );
  }
  return { scalingNotes: notes };
}

function parseSweep(raw: string): number[] {
  return raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function kb(bytes: number): number {
  return Math.round(bytes / 1024);
}
