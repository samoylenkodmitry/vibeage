import type { ItemDrop } from '../../packages/protocol/messages.js';
import type { Enemy } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { emitStarterProgressUpdate, recordStarterLootPickup } from '../progression/starterPath.js';
import {
  emitPlayerUpdated,
  emitServerMessage,
  emitServerMessageToClient,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { generateLoot as generateLootFromEnemy } from './generateLoot.js';
import { pickupGroundLoot } from './lootPickup.js';
import { addGroundLootStack, createGroundLootStack } from './lootRuntime.js';

export function addGroundLoot(state: GameState, enemyId: string, loot: ItemDrop[]): string | undefined {
  const spawn = addGroundLootStack(state, enemyId, loot);
  if (!spawn) return undefined;

  debug(LOG_CATEGORIES.LOOT, `Added ground loot ${spawn.lootId}`, { position: spawn.stack.position });
  return spawn.lootId;
}

export function spawnLootForEnemyDeath(state: GameState, outbound: OutboundEventSink, enemy: Enemy): void {
  if (!enemy.lootTableId) return;

  const loot = generateLootFromEnemy(enemy);
  if (!loot.length) return;

  const spawn = createGroundLootStack(state, enemy, loot);
  if (!spawn) return;

  debug(LOG_CATEGORIES.LOOT, `Added ground loot ${spawn.lootId} to game state`, {
    position: spawn.stack.position,
    itemCount: loot.length,
  });

  emitServerMessage(outbound, {
    type: 'LootSpawn',
    enemyId: enemy.id,
    lootId: spawn.lootId,
    position: spawn.stack.position,
    loot,
  });

  debug(LOG_CATEGORIES.LOOT, `Broadcast loot spawn ${spawn.lootId}`, { itemCount: loot.length });
}

export function tryGiveLoot(state: GameState, outbound: OutboundEventSink, playerId: string, lootId: string): boolean {
  const result = pickupGroundLoot(state, playerId, lootId);

  if (result.ok === false) {
    return false;
  }

  emitServerMessage(outbound, {
    type: 'LootPickup',
    lootId,
    playerId,
  });

  emitServerMessageToClient(outbound, result.player.socketId, {
    type: 'LootAcquired',
    items: result.items,
    sourceEnemyName: result.sourceEnemyName,
  });

  const itemCount = result.items.reduce((sum, item) => sum + item.quantity, 0);
  const starterProgress = recordStarterLootPickup(result.player, itemCount);
  emitStarterProgressUpdate(outbound, result.player, starterProgress.rewardGranted);

  if (starterProgress.rewardGranted) {
    emitPlayerUpdated(outbound, {
      id: result.player.id,
      availableSkillPoints: result.player.availableSkillPoints,
    });
  }

  return true;
}
