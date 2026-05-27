import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { spawnLootForEnemyDeath } from '../loot/groundLoot.js';
import { awardPlayerXP } from '../players/playerLifecycle.js';
import { onEnemyKilledForQuests } from '../players/playerQuests.js';
import { emitStarterProgressUpdate, recordStarterEnemyDefeat } from '../progression/starterPath.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitPlayerUpdated, emitServerMessage, type OutboundEventSink } from '../transport/outboundEvents.js';

export type TargetDeathContext = {
  state: GameState;
  spatial: SpatialHashGrid;
  outbound: OutboundEventSink;
  now: number;
  spawnLoot?: (state: GameState, outbound: OutboundEventSink, enemy: Enemy, killer?: PlayerState | null) => void;
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
  target.deathTimeTs = context.now;
  target.health = 0;
  context.spatial.remove(target.id, { x: target.position.x, z: target.position.z });

  // §11 named encounter tracking — broadcast mini-boss falls so
  // players in any zone see the killfeed. Pairs with the respawn
  // broadcast in respawnDeadEnemies.
  if (isEnemy(target) && target.isMiniBoss) {
    emitServerMessage(context.outbound, {
      type: 'ChatBroadcast',
      fromId: target.id,
      fromName: target.name,
      text: `${target.name} has fallen to ${caster.name}!`,
      scope: 'all',
      ts: target.deathTimeTs,
    });
  }

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
      // §45.3 follow-up — thread killer through so loot-rate
      // spec passives (Treasure Hunter Lucky Find) get a chance
      // to scale drop chances.
      spawnLoot(context.state, context.outbound, target, caster);
    }
  }

  return true;
}

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'baseExperienceValue' in target;
}
