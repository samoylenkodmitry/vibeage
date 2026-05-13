import type { Enemy, PlayerState } from '../../shared/types.js';
import type { GameState } from '../gameState.js';
import { spawnLootForEnemyDeath } from '../loot/groundLoot.js';
import { awardPlayerXP } from '../players/playerLifecycle.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

export type TargetDeathContext = {
  state: GameState;
  spatial: SpatialHashGrid;
  outbound: OutboundEventSink;
  now?: number;
  spawnLoot?: (state: GameState, outbound: OutboundEventSink, enemy: Enemy) => void;
};

export function handleTargetDeath(
  caster: PlayerState,
  target: Enemy | PlayerState,
  context: TargetDeathContext,
): boolean {
  if (!target.isAlive) {
    return false;
  }

  console.log(`Target died: ${JSON.stringify(target)}`);
  target.isAlive = false;
  target.deathTimeTs = context.now ?? Date.now();
  target.health = 0;
  context.spatial.remove(target.id, { x: target.position.x, z: target.position.z });

  if (caster.isAlive && isEnemy(target)) {
    emitPlayerUpdated(
      context.outbound,
      awardPlayerXP(caster, target.baseExperienceValue, `killing ${target.name}`),
    );
    if (target.lootTableId) {
      const spawnLoot = context.spawnLoot ?? spawnLootForEnemyDeath;
      spawnLoot(context.state, context.outbound, target);
    }
  }

  return true;
}

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'baseExperienceValue' in target;
}
