// server/ai/enemyAI.ts
import { Enemy } from '../../shared/types.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { EntityState } from '../gameState.js';
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
    emitEnemyAIEvent(outbound, event);
  }

  if (result.enemyUpdate) {
    emitEnemyUpdated(outbound, result.enemyUpdate);
  }
}

function emitEnemyAIEvent(outbound: OutboundEventSink, event: EnemyAIEvent): void {
  if (event.type === 'log') {
    console.log(event.message);
    return;
  }

  if (event.type === 'enemyAttack') {
    console.log(`[AI] Enemy ${event.enemyId} attacked player ${event.targetId} for ${event.damage} damage. Player HP: ${event.targetHealth}`);
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

  console.log(event.message);
  emitPlayerUpdated(outbound, event.update);
}
