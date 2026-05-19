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
  runInputAndMovementPhase(input);
  runEnemyAiPhase(input);
  runCombatPhase(input);
  const nextAccumulator = runSnapshotPhase(input);
  runMaintenancePhase(input);
  return nextAccumulator;
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
function spawnNewlyActivatedZones(input: WorldTickRunnerOptions): void {
  if (!input.zoneManager) return;
  // PR WW perf — bot review: this runs every tick. Active-zone
  // budget is small (8), so `.includes()` on the array beats a
  // fresh `new Set(...)` allocation 30× / sec. Tests in
  // tests/frostWolfSpawn.spec.ts pin the behaviour.
  const spawnedIds = input.state.zones.spawnedZoneIds;
  const newlyActive = input.state.zones.activeZoneIds.filter((id) => !spawnedIds.includes(id));
  if (newlyActive.length === 0) return;
  spawnInitialEnemies(input.state, input.spatial, input.zoneManager, {
    activeZoneIds: newlyActive,
  });
}

function runEnemyAiPhase(input: WorldTickRunnerOptions): void {
  for (const enemyId in input.state.enemies) {
    if (!hasRecordKey(input.state.enemies, enemyId)) {
      continue;
    }

    const enemy = input.state.enemies[enemyId];
    if (enemy.isAlive && isEnemyInActiveRegion(input.state, enemyId)) {
      updateEnemyAI(enemy, input.state, input.outbound, input.spatial, input.tickMs / 1000);
    }
  }
}

function runCombatPhase(input: WorldTickRunnerOptions & { now: number }): void {
  tickCasts(
    input.state.activeCasts,
    input.tickMs,
    input.outbound,
    createWorldCombatBridge(input.state, input.outbound, input.spatial),
  );
  tickDamageOverTimeEffects(input.state, input.outbound, input.now);
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
