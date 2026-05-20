// server/ai/enemyAI.ts
import { Enemy } from '../../packages/sim/entities.js';
import { DEFAULT_PACK_AGGRO_RADIUS_M } from '../../packages/content/enemies.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { EntityState } from '../gameState.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import {
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { advanceEnemyState, type EnemyAIEvent } from './enemyStateMachine.js';

// §46/slice-3 — pack aggro / disengage now read the source enemy's
// `packAggroRadius` (set per species via EnemyStatMultipliers).
// `DEFAULT_PACK_AGGRO_RADIUS_M` is the baseline (60m) when the mob
// template doesn't carry an override.

export function updateEnemyAI(
  enemy: Enemy,
  gameState: EntityState,
  outbound: OutboundEventSink,
  spatialGrid: SpatialHashGrid,
  deltaTime: number,
): void {
  const result = advanceEnemyState(enemy, {
    players: gameState.players,
    spatialGrid,
    deltaTime,
    now: Date.now(),
  });

  for (const event of result.events) {
    emitEnemyAIEvent(outbound, event, gameState, spatialGrid, enemy);
  }

  if (result.enemyUpdate) {
    emitEnemyUpdated(outbound, result.enemyUpdate);
  }
}

function emitEnemyAIEvent(
  outbound: OutboundEventSink,
  event: EnemyAIEvent,
  gameState: EntityState,
  spatialGrid: SpatialHashGrid,
  source: Enemy,
): void {
  if (event.type === 'log') {
    debug(LOG_CATEGORIES.ENEMY, event.message);
    return;
  }

  if (event.type === 'enemyAttack') {
    debug(LOG_CATEGORIES.ENEMY, `Enemy ${event.enemyId} attacked player ${event.targetId}`, {
      damage: event.damage,
      targetHealth: event.targetHealth,
    });
    emitServerMessage(outbound, {
      type: 'EnemyAttack',
      enemyId: event.enemyId,
      targetId: event.targetId,
      damage: event.damage,
    });
    emitPlayerUpdated(outbound, {
      id: event.targetId,
      health: event.targetHealth,
    });
    return;
  }

  if (event.type === 'packAggro') {
    propagatePackAggro({
      gameState,
      spatialGrid,
      outbound,
      packId: event.packId,
      targetId: event.targetId,
      sourceEnemyId: event.sourceEnemyId,
      source,
    });
    return;
  }

  if (event.type === 'packDisengage') {
    propagatePackDisengage({
      gameState,
      spatialGrid,
      outbound,
      packId: event.packId,
      sourceEnemyId: event.sourceEnemyId,
      source,
    });
    return;
  }

  if (event.type === 'bossTelegraph') {
    emitServerMessage(outbound, {
      type: 'BossTelegraph',
      enemyId: event.enemyId,
      bossName: event.bossName,
      abilityName: event.abilityName,
      x: event.x,
      z: event.z,
      radius: event.radius,
      windUpMs: event.windUpMs,
      impactAt: event.impactAt,
    });
    return;
  }

  debug(LOG_CATEGORIES.ENEMY, event.message);
  emitPlayerUpdated(outbound, event.update);
}

type PackAggroArgs = {
  gameState: EntityState;
  spatialGrid: SpatialHashGrid;
  outbound: OutboundEventSink;
  packId: string;
  targetId: string;
  sourceEnemyId: string;
  source: Enemy;
};

function propagatePackAggro({ gameState, spatialGrid, outbound, packId, targetId, sourceEnemyId, source }: PackAggroArgs): void {
  const radius = source.packAggroRadius ?? DEFAULT_PACK_AGGRO_RADIUS_M;
  const candidateIds = spatialGrid.queryCircle(
    { x: source.position.x, z: source.position.z },
    radius,
  );
  for (const id of candidateIds) {
    const enemy = gameState.enemies[id];
    if (!enemy || enemy.packId !== packId || enemy.id === sourceEnemyId || !enemy.isAlive) {
      continue;
    }
    if (enemy.aiState !== 'idle' && enemy.aiState !== 'patrolling') {
      continue;
    }
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    enemy.patrolTarget = undefined;
    emitEnemyUpdated(outbound, { id: enemy.id, targetId: enemy.targetId, aiState: enemy.aiState });
  }
}

type PackDisengageArgs = {
  gameState: EntityState;
  spatialGrid: SpatialHashGrid;
  outbound: OutboundEventSink;
  packId: string;
  sourceEnemyId: string;
  source: Enemy;
};

// §46/slice-3 — when one mob in a pack disengages (leash trip, anti-
// kite, target died), packmates currently chasing/attacking the same
// target release too and head home. Pack stays cohesive: it engages
// as a unit and breaks off as a unit, rather than one mob hanging
// around solo because it happened to keep aggro.
function propagatePackDisengage({ gameState, spatialGrid, outbound, packId, sourceEnemyId, source }: PackDisengageArgs): void {
  const radius = source.packAggroRadius ?? DEFAULT_PACK_AGGRO_RADIUS_M;
  const candidateIds = spatialGrid.queryCircle(
    { x: source.position.x, z: source.position.z },
    radius,
  );
  for (const id of candidateIds) {
    const enemy = gameState.enemies[id];
    if (!enemy || enemy.packId !== packId || enemy.id === sourceEnemyId || !enemy.isAlive) {
      continue;
    }
    if (enemy.aiState !== 'chasing' && enemy.aiState !== 'attacking') {
      continue;
    }
    enemy.targetId = null;
    enemy.aiState = 'returning';
    enemy.chaseStartedAt = undefined;
    emitEnemyUpdated(outbound, { id: enemy.id, targetId: enemy.targetId, aiState: enemy.aiState });
  }
}
