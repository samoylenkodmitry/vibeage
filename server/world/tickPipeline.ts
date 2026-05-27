import { performance } from 'node:perf_hooks';
import { tickCasts } from '../combat/skillSystem.js';
import { createWorldCombatBridge } from './clientMessageRouter.js';
import { respawnDeadEnemies, spawnInitialEnemies } from '../enemies/enemyLifecycle.js';
import type { GameState } from '../gameState.js';
import type { ZoneManager } from '../../packages/content/zones.js';
import { updateEnemyAI } from '../ai/enemyAI.js';
import { handleResourceRegeneration } from '../players/playerLifecycle.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  emitBatchUpdate,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { collectDeltas } from '../movement/snapshotDeltas.js';
import { advanceAll } from '../movement/worldMovement.js';
import { tickDamageOverTimeEffects } from '../combat/dotTicker.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import {
  isEnemyInActiveRegion,
  refreshWorldRegionRuntime,
  type ServerWorldRegion,
} from './regions.js';
import {
  refreshServerOwnedRegionActivation,
  type WorldRegionActivationPolicy,
} from './regionActivation.js';

const WORLD_GAUGE_INTERVAL_TICKS = 30;

// Sample the (expensive) snapshot-bytes metric 1-in-N batches.
// At 10Hz snapshot cadence this records ~1 sample/sec, plenty for
// a stable p50/p95/p99 histogram without JSON.stringify'ing every
// batch in the hot path. Module-level counter — there's one tick
// loop per process.
const SNAPSHOT_BYTES_SAMPLE_EVERY = 10;
let snapshotBytesSampleCounter = 0;

export type WorldTickRunnerOptions = {
  state: GameState;
  spatial: SpatialHashGrid;
  outbound: OutboundEventSink;
  tickMs: number;
  snapHz: number;
  regions?: readonly ServerWorldRegion[];
  regionActivationPolicy?: WorldRegionActivationPolicy;
  /**
   * PR WW — passed in so the tick can spawn newly-active zones on
   * first activation post-boot. Without this, Frozen Tundra (not
   * in the initial 8 active zones) had no frost wolves when a
   * player walked in for the first time.
   */
  zoneManager?: ZoneManager;
};

export type WorldTickRunner = {
  tick(now?: number): void;
};

export function createWorldTickRunner(options: WorldTickRunnerOptions): WorldTickRunner {
  let snapAccumulator = 0;
  let maintenanceTick = 0;
  let worldGaugeTick = WORLD_GAUGE_INTERVAL_TICKS - 1;
  const snapshotEveryTicks = Math.max(1, Math.round(1000 / options.tickMs / options.snapHz));
  const maintenanceEveryTicks = snapshotEveryTicks;

  return {
    tick(now = Date.now()) {
      const startedAt = performance.now();
      maintenanceTick += 1;
      snapAccumulator = runWorldTick({
        ...options,
        now,
        snapAccumulator,
        snapshotEveryTicks,
        maintenanceTick,
        maintenanceEveryTicks,
      });
      runtimeMetrics.recordTickMs(performance.now() - startedAt);
      worldGaugeTick += 1;
      if (worldGaugeTick >= WORLD_GAUGE_INTERVAL_TICKS) {
        worldGaugeTick = 0;
        recordWorldGauges(options.state);
      }
    },
  };
}

function runWorldTick(input: WorldTickRunnerOptions & {
  now: number;
  snapAccumulator: number;
  snapshotEveryTicks: number;
  maintenanceTick: number;
  maintenanceEveryTicks: number;
}): number {
  // §52 #12 follow-up — per-phase timing so the load test (and a
  // future Grafana dashboard) can isolate which slice eats budget
  // as the world scales. `runtimeMetrics.tickMs` already covers the
  // whole tick; this decomposes the budget without doubling cost
  // (a single `performance.now()` per phase, negligible).
  timed('tick.phase.inputMovement', () => runInputAndMovementPhase(input));
  timed('tick.phase.enemyAi', () => runEnemyAiPhase(input));
  timed('tick.phase.combat', () => runCombatPhase(input));
  let nextAccumulator = input.snapAccumulator;
  timed('tick.phase.snapshot', () => { nextAccumulator = runSnapshotPhase(input); });
  timed('tick.phase.maintenance', () => runMaintenancePhase(input));
  return nextAccumulator;
}

function timed(name: string, fn: () => void): void {
  const startedAt = performance.now();
  try {
    fn();
  } finally {
    runtimeMetrics.recordHistogram(name, performance.now() - startedAt);
  }
}

function runInputAndMovementPhase(input: WorldTickRunnerOptions & { now: number }): void {
  advanceAll(input.state, input.spatial, input.tickMs, input.now, input.outbound);
  if (input.regions) {
    refreshServerOwnedRegionActivation(input.state, input.regions, input.regionActivationPolicy);
    refreshWorldRegionRuntime(input.state, input.regions);
    spawnNewlyActivatedZones(input);
  }
}

/**
 * PR WW — when a region activates for the first time (player walks
 * into a zone that wasn't in the initial active set), spawn its
 * starting mob population. Tracked in `state.zones.spawnedZoneIds`
 * so re-activations don't double-spawn.
 */
function spawnNewlyActivatedZones(input: WorldTickRunnerOptions & { now: number }): void {
  if (!input.zoneManager) return;
  // PR WW perf — bot review: this runs every tick. Active-zone
  // budget is small (8), so `.includes()` on the array beats a
  // fresh `new Set(...)` allocation 30× / sec. Tests in
  // tests/frostWolfSpawn.spec.ts pin the behaviour.
  const spawnedIds = input.state.zones.spawnedZoneIds;
  const newlyActive = input.state.zones.activeZoneIds.filter((id) => !spawnedIds.includes(id));
  if (newlyActive.length === 0) return;
  spawnInitialEnemies(input.state, input.spatial, input.zoneManager, input.now, {
    activeZoneIds: newlyActive,
  });
}

function runEnemyAiPhase(input: WorldTickRunnerOptions & { now: number }): void {
  // The AI casts mob skills through the shared pipeline; the cast lands
  // in activeCasts and the combat phase's tickCasts resolves it.
  const world = createWorldCombatBridge(input.state, input.outbound, input.spatial);
  for (const enemyId in input.state.enemies) {
    if (!hasRecordKey(input.state.enemies, enemyId)) {
      continue;
    }

    const enemy = input.state.enemies[enemyId];
    if (enemy.isAlive && isEnemyInActiveRegion(input.state, enemyId)) {
      updateEnemyAI(enemy, input.state, input.outbound, input.spatial, input.tickMs / 1000, input.now, world, input.state.activeCasts);
    }
  }
}

function runCombatPhase(input: WorldTickRunnerOptions & { now: number }): void {
  tickCasts(
    input.state.activeCasts,
    input.tickMs,
    input.outbound,
    createWorldCombatBridge(input.state, input.outbound, input.spatial),
    input.now,
  );
  tickDamageOverTimeEffects(input.state, input.spatial, input.outbound, input.now);
}

function runSnapshotPhase(input: WorldTickRunnerOptions & {
  now: number;
  snapAccumulator: number;
  snapshotEveryTicks: number;
}): number {
  const snapAccumulator = input.snapAccumulator + 1;
  if (snapAccumulator < input.snapshotEveryTicks) {
    return snapAccumulator;
  }

  const updates = collectDeltas(input.state, input.now, new Set());
  runtimeMetrics.setGauge('snapshot.lastUpdates', updates.length);
  if (updates.length > 0) {
    runtimeMetrics.increment('snapshot.batches');
    runtimeMetrics.increment('snapshot.updates', updates.length);
    // §52 #5 — histogram of batch sizes so the dashboard can graph
    // p50/p95/p99 update payload sizes. Big tails here usually mean
    // the broadcast loop is shipping more deltas than the snapshot
    // budget assumed; the percentile is the right alarm signal.
    runtimeMetrics.recordHistogram('snapshot.batchSize', updates.length);
    // §52 #12 follow-up — record the bytes weight per batch so load
    // tests can see how the wire payload scales with concurrent
    // players. Perf: JSON.stringify of the whole batch is O(payload)
    // and ran on EVERY snapshot (10Hz) purely for this metric —
    // double-serializing the batch in the hot path as player count
    // grows. Sample 1-in-N instead: a histogram's p50/p95/p99 stays
    // representative from a 10% sample, at a tenth of the cost.
    snapshotBytesSampleCounter += 1;
    if (snapshotBytesSampleCounter >= SNAPSHOT_BYTES_SAMPLE_EVERY) {
      snapshotBytesSampleCounter = 0;
      runtimeMetrics.recordHistogram('snapshot.batchBytes', JSON.stringify(updates).length);
    }
    emitBatchUpdate(input.outbound, updates);
  }
  return 0;
}

function runMaintenancePhase(input: WorldTickRunnerOptions & {
  maintenanceTick: number;
  maintenanceEveryTicks: number;
  now: number;
}): void {
  if (shouldRunMaintenance(input.maintenanceTick, input.maintenanceEveryTicks, 1)) {
    handleResourceRegeneration(input.state, input.outbound, input.now);
  }

  if (shouldRunMaintenance(input.maintenanceTick, input.maintenanceEveryTicks, 2)) {
    respawnDeadEnemies(input.state, input.spatial, input.outbound, input.now);
  }
}

function shouldRunMaintenance(tick: number, interval: number, offset: number): boolean {
  if (interval <= 1) {
    return true;
  }

  return tick % interval === offset % interval;
}

export function recordWorldGauges(state: GameState): void {
  let enemyCount = 0;
  let aliveEnemyCount = 0;
  for (const enemyId in state.enemies) {
    if (!hasRecordKey(state.enemies, enemyId)) {
      continue;
    }

    enemyCount += 1;
    if (state.enemies[enemyId].isAlive) {
      aliveEnemyCount += 1;
    }
  }

  runtimeMetrics.setGauge('players.active', countRecordEntries(state.players));
  runtimeMetrics.setGauge('enemies.total', enemyCount);
  runtimeMetrics.setGauge('enemies.alive', aliveEnemyCount);
  runtimeMetrics.setGauge('zones.active', state.zones.activeZoneIds.length);
  runtimeMetrics.setGauge('zones.playersTracked', countRecordEntries(state.zones.playerZoneIds));
  runtimeMetrics.setGauge('casts.active', countRecordEntries(state.activeCasts));
  runtimeMetrics.setGauge('loot.groundStacks', countRecordEntries(state.groundLoot));
}

function countRecordEntries(record: Record<string, unknown>): number {
  let count = 0;
  for (const key in record) {
    if (hasRecordKey(record, key)) {
      count += 1;
    }
  }
  return count;
}

function hasRecordKey<T>(record: Record<string, T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
