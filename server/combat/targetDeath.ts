import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { spawnLootForEnemyDeath } from '../loot/groundLoot.js';
import { awardPlayerXP } from '../players/playerLifecycle.js';
import { onEnemyKilledForQuests } from '../players/playerQuests.js';
import { emitStarterProgressUpdate, recordStarterEnemyDefeat } from '../progression/starterPath.js';
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

  debug(LOG_CATEGORIES.COMBAT, `Target died: ${target.id}`, {
    casterId: caster.id,
    targetType: isEnemy(target) ? 'enemy' : 'player',
  });
  target.isAlive = false;
  target.deathTimeTs = context.now ?? Date.now();
  target.health = 0;
  context.spatial.remove(target.id, { x: target.position.x, z: target.position.z });

  if (caster.isAlive && isEnemy(target)) {
    const xpUpdate = awardPlayerXP(caster, target.baseExperienceValue, `killing ${target.name}`);
    const starterProgress = recordStarterEnemyDefeat(caster, target.id);
    emitPlayerUpdated(
      context.outbound,
      {
        ...xpUpdate,
        availableSkillPoints: caster.availableSkillPoints,
      },
    );
    emitStarterProgressUpdate(context.outbound, caster, starterProgress.rewardGranted);
    // Quest engine: any active quest with a kill objective matching
    // this enemy's `type` ticks up. Single read site — adding more
    // kill quests in QUESTS is content-only.
    onEnemyKilledForQuests(caster, target.type, context.outbound, target.bossId);

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
