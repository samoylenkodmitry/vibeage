#!/usr/bin/env tsx
/**
 * §52 #12 — in-process load test scaffold.
 *
 * Spawns N simulated players into a fresh GameState, runs the world
 * tick pipeline for K ticks, optionally simulates simple movement
 * intents, and prints a JSON report at the end (tick cost percentiles
 * + histograms collected by runtimeMetrics). No real WebSocket
 * clients — that's a separate (much larger) PR. This slice gets
 * tick-cost + memory + snapshot-bytes + DB-write-latency signal at
 * scale without needing the network stack.
 *
 * Usage:
 *   LOAD_PLAYERS=50 LOAD_TICKS=600 tsx scripts/load-test-inprocess.ts
 *
 * Environment variables (all optional):
 *   LOAD_PLAYERS         number of simulated players (default 10)
 *   LOAD_TICKS           number of ticks to run (default 600 = 20s @ 30Hz)
 *   LOAD_TICK_MS         tick interval (default 1000/30 ≈ 33.3ms)
 *   LOAD_SNAP_HZ         snapshot Hz (default 10)
 *   LOAD_MOVE_INTERVAL   ticks between move intents per player (default 30)
 *
 * The script never opens a DB connection; histograms emitted from the
 * persistence layer stay at zero samples in the report (expected).
 */

import { performance } from 'node:perf_hooks';
import { ZoneManager } from '../packages/content/zones.js';
import { spawnInitialEnemies } from '../server/enemies/enemyLifecycle.js';
import type { GameState } from '../server/gameState.js';
import { createGameState } from '../server/gameState.js';
import { createTransientPlayer } from '../server/playerFactory.js';
import { runtimeMetrics } from '../server/observability/runtimeMetrics.js';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid.js';
import { handleClientMessage } from '../server/world/clientMessageRouter.js';
import { createWorldTickRunner } from '../server/world/tickPipeline.js';
import {
  DEFAULT_WORLD_ZONE_SPAWN_POLICY,
  initializeServerDrivenZoneRuntime,
} from '../server/world/zoneRuntime.js';
import type { Enemy, PlayerState } from '../packages/sim/entities.js';

const playerCount = Number(process.env.LOAD_PLAYERS ?? 10);
const tickCount = Number(process.env.LOAD_TICKS ?? 600);
const tickMs = Number(process.env.LOAD_TICK_MS ?? 1000 / 30);
const snapHz = Number(process.env.LOAD_SNAP_HZ ?? 10);
const moveIntervalTicks = Number(process.env.LOAD_MOVE_INTERVAL ?? 30);
// §52 #12 — combat behavior. Each bot finds the nearest alive enemy
// every `castIntervalTicks` and fires a CastReq for its starter skill
// through the real `handleClientMessage` boundary. Turns the test from
// a snapshot/movement smoke into a snapshot/movement/AI/combat one —
// the relative cost of each phase shows up in the histograms.
const combatEnabled = process.env.LOAD_COMBAT === '1';
const castIntervalTicks = Number(process.env.LOAD_CAST_INTERVAL ?? 60);
/**
 * §52 #12 — bots fire Fireball at the nearest alive enemy within
 * this radius. Outside the radius they stay passive (mirrors a
 * player who hasn't pulled aggro yet). Fireball reaches ~40m which
 * is far enough to engage from the default seed spread without
 * burning every cast on out-of-range rejects.
 */
const CAST_ENGAGEMENT_RADIUS_M = 40;

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

for (let i = 0; i < playerCount; i += 1) {
  const player = createTransientPlayer(`load-socket-${i}`, `Bot${i}`);
  player.id = `load-bot-${i}`;
  // Spread bots around so the spatial grid actually exercises buckets
  // instead of all queries hitting the same cell.
  const angle = (i / playerCount) * Math.PI * 2;
  const radius = 5 + (i % 20);
  player.position = { x: Math.cos(angle) * radius, y: 0.5, z: Math.sin(angle) * radius };
  state.players[player.id] = player;
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });
}

const outbound = {
  publish() {
    // §52 #12 — load test runs without a real transport. The publish
    // sink is intentionally a no-op so we measure the server's tick
    // work without coupling to Colyseus / websocket / JSON.stringify
    // costs of the wire. The snapshot.* histograms in clientSnapshot
    // record on the actual send path, which the in-process test does
    // not exercise.
  },
};

const memBefore = process.memoryUsage();
const runner = createWorldTickRunner({
  state,
  spatial,
  outbound,
  tickMs,
  snapHz,
});

const startedAt = performance.now();
let now = Date.now();
for (let t = 0; t < tickCount; t += 1) {
  if (moveIntervalTicks > 0 && t % moveIntervalTicks === 0) throwMovementIntents(state, t, now);
  if (combatEnabled && castIntervalTicks > 0 && t % castIntervalTicks === 0) throwCastIntents(state, spatial, now);
  runner.tick(now);
  now += tickMs;
}
const elapsedMs = performance.now() - startedAt;
const memAfter = process.memoryUsage();

const metricsSnapshot = runtimeMetrics.snapshot();

console.log(JSON.stringify({
  config: {
    playerCount,
    tickCount,
    tickMs,
    snapHz,
    moveIntervalTicks,
  },
  world: {
    spawnedEnemies,
    activeZones: state.zones.activeZoneIds.length,
  },
  runtime: {
    elapsedMs: round(elapsedMs),
    realtimeBudgetMs: round(tickCount * tickMs),
    realtimeRatio: round(elapsedMs / (tickCount * tickMs)),
    averageTickMs: round(elapsedMs / tickCount),
  },
  rates: ratesPerSecond(metricsSnapshot.counters, tickCount, tickMs),
  tickMs: metricsSnapshot.tickMs,
  histograms: metricsSnapshot.histograms,
  countersTop: pickTopCounters(metricsSnapshot.counters, 20),
  memoryDeltaKB: {
    rss: kb(memAfter.rss - memBefore.rss),
    heapUsed: kb(memAfter.heapUsed - memBefore.heapUsed),
    external: kb(memAfter.external - memBefore.external),
  },
  memoryFinalKB: {
    rss: kb(memAfter.rss),
    heapUsed: kb(memAfter.heapUsed),
  },
}, null, 2));

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function kb(bytes: number): number {
  return Math.round(bytes / 1024);
}

function pickTopCounters(counters: Record<string, number>, limit: number): Record<string, number> {
  const sorted = Object.entries(counters).sort(([, a], [, b]) => b - a).slice(0, limit);
  return Object.fromEntries(sorted);
}

/**
 * §52 #12 — derived rates (per second of simulated wall time) for the
 * counters that matter most for capacity planning. Computed from the
 * total tick window (`tickCount * tickMs / 1000`) so the numbers stay
 * comparable across runs with different tick budgets.
 */
function ratesPerSecond(
  counters: Record<string, number>,
  ticks: number,
  msPerTick: number,
): Record<string, number> {
  const seconds = (ticks * msPerTick) / 1000;
  if (seconds <= 0) return {};
  const rate = (key: string): number => round((counters[key] ?? 0) / seconds);
  return {
    outboundTotalPerSec: rate('outbound.total'),
    outboundPlayerUpdatedPerSec: rate('outbound.playerUpdated'),
    outboundEnemyUpdatedPerSec: rate('outbound.enemyUpdated'),
    batchedPosSnapPerSec: rate('outbound.batched.PosSnap'),
    snapshotBatchesPerSec: rate('snapshot.batches'),
    castReqReceivedPerSec: rate('castReq.received'),
    castReqAcceptedPerSec: rate('castReq.accepted'),
  };
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

/**
 * §52 #12 (LOAD_COMBAT=1) — each bot picks the nearest alive enemy
 * within a generous radius and fires a CastReq through the real
 * `handleClientMessage` boundary. Uses the bot's starter skill
 * (basicAttack always exists). Output stays consistent across runs
 * because the search is positional, not pseudorandom.
 */
function throwCastIntents(state: GameState, spatial: SpatialHashGrid, now: number): void {
  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (!player.isAlive) continue;
    const target = findNearestEnemyWithin(state, player, CAST_ENGAGEMENT_RADIUS_M);
    if (!target) continue;
    const socket = { id: player.socketId ?? player.id, emit: () => undefined };
    handleClientMessage(
      socket,
      state,
      {
        type: 'CastReq', id: player.id, skillId: 'fireball',
        clientTs: now, targetId: target.id,
      },
      { publish: () => undefined },
      spatial,
    );
  }
}

function findNearestEnemyWithin(state: GameState, player: PlayerState, maxDist: number): Enemy | null {
  let nearest: Enemy | null = null;
  let nearestDist = maxDist;
  for (const enemyId in state.enemies) {
    const enemy = state.enemies[enemyId];
    if (!enemy.isAlive) continue;
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < nearestDist) {
      nearest = enemy;
      nearestDist = dist;
    }
  }
  return nearest;
}
