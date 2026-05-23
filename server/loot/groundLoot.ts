import type { ItemDrop } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
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

export function spawnLootForEnemyDeath(state: GameState, outbound: OutboundEventSink, enemy: Enemy, killer?: PlayerState | null): void {
  if (!enemy.lootTableId) return;

  // §45.3 follow-up — killer's spec passive can boost loot rolls.
  // Passed through to `generateLoot`; null / no spec → no boost.
  const loot = generateLootFromEnemy(enemy, killer);
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

export type TryGiveLootResult =
  | { ok: true }
  | { ok: false; reason: 'playerNotFound' | 'lootNotFound' | 'tooFar' | 'inventoryFull' | 'itemNotFound' | 'invariantViolation' };

export function tryGiveLoot(
  state: GameState,
  outbound: OutboundEventSink,
  playerId: string,
  lootId: string,
): TryGiveLootResult {
  const result = pickupGroundLoot(state, playerId, lootId);

  if (result.ok === false) {
    return { ok: false, reason: result.reason };
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

  // §52 follow-up — gold credit is in-memory only; without an
  // explicit playerUpdated the wallet stays stale on the client
  // (vitals strip shows old gold). The user sees "Picked up 45 gold"
  // in the chat but the counter doesn't move until the next unrelated
  // tick. Push the value now so the chat line and the counter agree.
  const goldCredited = result.items
    .filter((item) => item.itemId === 'gold_coin')
    .reduce((sum, item) => sum + item.quantity, 0);
  if (goldCredited > 0) {
    emitPlayerUpdated(outbound, { id: result.player.id, gold: result.player.gold });
  }

  const itemCount = result.items.reduce((sum, item) => sum + item.quantity, 0);
  const starterProgress = recordStarterLootPickup(result.player, itemCount);
  emitStarterProgressUpdate(outbound, result.player, starterProgress.rewardGranted);

  if (starterProgress.rewardGranted) {
    emitPlayerUpdated(outbound, {
      id: result.player.id,
      availableSkillPoints: result.player.availableSkillPoints,
    });
  }

  return { ok: true };
}
