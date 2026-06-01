import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import {
  emitEnemyUpdated,
  emitPlayerUpdated,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';

export function emitCombatantUpdated(outbound: OutboundEventSink, target: Enemy | PlayerState): void {
  if (isEnemy(target)) {
    emitEnemyUpdated(outbound, target);
    return;
  }
  // PvP: broadcast the player's health change immediately so other
  // clients see the damage right away instead of waiting for the
  // next tick-pipeline snapshot.
  emitPlayerUpdated(outbound, {
    id: target.id,
    health: target.health,
    isAlive: target.isAlive,
    deathTimeTs: target.deathTimeTs,
    statusEffects: target.statusEffects,
    stats: target.stats,
    maxHealth: target.maxHealth,
    maxMana: target.maxMana,
    position: target.position,
  });
}

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target;
}
