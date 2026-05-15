// server/ai/enemyAI.ts
import { Enemy } from '../../packages/sim/entities.js';
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
    emitEnemyAIEvent(outbound, event, gameState);
  }

  if (result.enemyUpdate) {
    emitEnemyUpdated(outbound, result.enemyUpdate);
  }
}

function emitEnemyAIEvent(outbound: OutboundEventSink, event: EnemyAIEvent, gameState: EntityState): void {
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
    propagatePackAggro(gameState, outbound, event.packId, event.targetId, event.sourceEnemyId);
    return;
  }

  debug(LOG_CATEGORIES.ENEMY, event.message);
  emitPlayerUpdated(outbound, event.update);
}

function propagatePackAggro(
  gameState: EntityState,
  outbound: OutboundEventSink,
  packId: string,
  targetId: string,
  sourceEnemyId: string,
): void {
  for (const enemy of Object.values(gameState.enemies)) {
    if (enemy.packId !== packId || enemy.id === sourceEnemyId || !enemy.isAlive) {
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
