import { performance } from 'node:perf_hooks';
import { tickCasts } from '../combat/skillSystem.js';
import { createWorldCombatBridge } from './clientMessageRouter.js';
import { respawnDeadEnemies } from '../enemies/enemyLifecycle.js';
import type { GameState } from '../gameState.js';
import { updateEnemyAI } from '../ai/enemyAI.js';
import { handleManaRegeneration } from '../players/playerLifecycle.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  emitBatchUpdate,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { collectDeltas } from '../movement/snapshotDeltas.js';
import { advanceAll } from '../movement/worldMovement.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import {
  refreshWorldRegionRuntime,
  type ServerWorldRegion,
} from './regions.js';

export type WorldTickRunnerOptions = {
  state: GameState;
  spatial: SpatialHashGrid;
  outbound: OutboundEventSink;
  tickMs: number;
  snapHz: number;
  regions?: readonly ServerWorldRegion[];
};

export type WorldTickRunner = {
  tick(now?: number): void;
};

export function createWorldTickRunner(options: WorldTickRunnerOptions): WorldTickRunner {
  let snapAccumulator = 0;
  const snapshotEveryTicks = Math.max(1, Math.round(1000 / options.tickMs / options.snapHz));

  return {
    tick(now = Date.now()) {
      const startedAt = performance.now();
      snapAccumulator = runWorldTick({ ...options, now, snapAccumulator, snapshotEveryTicks });
      runtimeMetrics.recordTickMs(performance.now() - startedAt);
      recordWorldGauges(options.state);
    },
  };
}

function runWorldTick(input: WorldTickRunnerOptions & {
  now: number;
  snapAccumulator: number;
  snapshotEveryTicks: number;
}): number {
  runInputAndMovementPhase(input);
  runEnemyAiPhase(input);
  runCombatPhase(input);
  const nextAccumulator = runSnapshotPhase(input);
  runMaintenancePhase({ ...input, snapAccumulator: nextAccumulator });
  return nextAccumulator;
}

function runInputAndMovementPhase(input: WorldTickRunnerOptions & { now: number }): void {
  advanceAll(input.state, input.spatial, input.tickMs, input.now);
  if (input.regions) {
    refreshWorldRegionRuntime(input.state, input.regions);
  }
}

function runEnemyAiPhase(input: WorldTickRunnerOptions): void {
  for (const enemy of Object.values(input.state.enemies)) {
    if (enemy.isAlive) {
      updateEnemyAI(enemy, input.state, input.outbound, input.spatial, input.tickMs / 1000);
    }
  }
}

function runCombatPhase(input: WorldTickRunnerOptions): void {
  tickCasts(
    input.state.activeCasts,
    input.tickMs,
    input.outbound,
    createWorldCombatBridge(input.state, input.outbound, input.spatial),
  );
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
  now: number;
  snapAccumulator: number;
}): void {
  if (input.snapAccumulator === 1) {
    handleManaRegeneration(input.state, input.outbound);
  }

  if (input.snapAccumulator === 2) {
    respawnDeadEnemies(input.state, input.spatial, input.outbound, input.now);
  }
}

function recordWorldGauges(state: GameState): void {
  const enemies = Object.values(state.enemies);
  runtimeMetrics.setGauge('players.active', Object.keys(state.players).length);
  runtimeMetrics.setGauge('enemies.total', enemies.length);
  runtimeMetrics.setGauge('enemies.alive', enemies.filter((enemy) => enemy.isAlive).length);
  runtimeMetrics.setGauge('zones.active', state.zones.activeZoneIds.length);
  runtimeMetrics.setGauge('zones.playersTracked', Object.keys(state.zones.playerZoneIds).length);
  runtimeMetrics.setGauge('casts.active', Object.keys(state.activeCasts).length);
  runtimeMetrics.setGauge('loot.groundStacks', Object.keys(state.groundLoot).length);
}
