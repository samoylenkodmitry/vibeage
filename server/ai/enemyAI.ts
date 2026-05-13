// server/ai/enemyAI.ts
import { Server } from 'socket.io';
import { Enemy } from '../../shared/types.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { EntityState } from '../gameState.js';
import { advanceEnemyState, type EnemyAIEvent } from './enemyStateMachine.js';

export function updateEnemyAI(
  enemy: Enemy,
  gameState: EntityState,
  io: Server,
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
    emitEnemyAIEvent(io, event);
  }

  if (result.enemyUpdate) {
    io.emit('enemyUpdated', result.enemyUpdate);
  }
}

function emitEnemyAIEvent(io: Server, event: EnemyAIEvent): void {
  if (event.type === 'log') {
    console.log(event.message);
    return;
  }

  if (event.type === 'enemyAttack') {
    console.log(`[AI] Enemy ${event.enemyId} attacked player ${event.targetId} for ${event.damage} damage. Player HP: ${event.targetHealth}`);
    io.emit('msg', {
      type: 'EnemyAttack',
      enemyId: event.enemyId,
      targetId: event.targetId,
      damage: event.damage,
    });
    io.emit('playerUpdated', {
      id: event.targetId,
      health: event.targetHealth,
    });
    return;
  }

  console.log(event.message);
  io.emit('playerUpdated', event.update);
}
