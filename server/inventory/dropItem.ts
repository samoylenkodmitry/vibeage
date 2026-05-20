import type { DropItem } from '../../packages/protocol/messages.js';
import { instanceAtSlot } from '../../packages/sim/characterInventory.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import type { GameState } from '../gameState.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import { createPlayerDroppedLootStack } from '../loot/lootRuntime.js';
import {
  emitServerMessage,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { ensureCharacterInventory, removeItemsFromPlayer } from './aggregateBridge.js';
import { emitInventoryUpdate } from '../world/clientMessageRouter.js';

type DropItemClient = { id: string };

/**
 * §46/slice-new — `DropItem` discards a stack (or a partial count)
 * from the caller's bag and spawns a `groundLoot` entity at the
 * player's current position. Ownership: only the socket bound to
 * the player may drop from their own bag. Counts are clamped to the
 * stack quantity. No-ops silently on invalid slot / dead player so
 * we don't gift the client a "your inventory really had X" oracle.
 */
export function onDropItem(
  socket: DropItemClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: DropItem,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    warn(LOG_CATEGORIES.PLAYER, `DropItem rejected: no player for socket ${socket.id}`);
    return;
  }
  const player = state.players[playerId];
  if (!player) return;
  if (!player.isAlive) {
    warn(LOG_CATEGORIES.PLAYER, `DropItem rejected: player ${playerId} is dead`);
    return;
  }

  const instance = instanceAtSlot(ensureCharacterInventory(player), msg.slotIndex);
  if (!instance) {
    warn(LOG_CATEGORIES.PLAYER, `DropItem rejected: empty slot ${msg.slotIndex} for ${playerId}`);
    return;
  }

  const droppedCount = Math.min(msg.count ?? instance.count, instance.count);
  if (droppedCount <= 0) return;

  const removed = removeItemsFromPlayer(player, instance.templateId, droppedCount);
  if (removed.ok === false) {
    warn(LOG_CATEGORIES.PLAYER, `DropItem failed during remove for ${playerId}: ${removed.error}`);
    return;
  }

  const spawn = createPlayerDroppedLootStack(state, player, [
    { itemId: instance.templateId, quantity: droppedCount },
  ]);
  if (!spawn) {
    warn(LOG_CATEGORIES.PLAYER, `DropItem: spawn returned null for ${playerId}`);
    return;
  }

  debug(LOG_CATEGORIES.LOOT, `Player ${playerId} dropped ${droppedCount}× ${instance.templateId} → ${spawn.lootId}`);

  // Broadcast the ground-loot spawn so every nearby client sees the
  // pile, then refresh the dropper's inventory so the bag UI updates.
  emitServerMessage(outbound, {
    type: 'LootSpawn',
    enemyId: `player:${player.id}`,
    lootId: spawn.lootId,
    position: spawn.stack.position,
    loot: spawn.loot,
  });
  emitInventoryUpdate(direct, player);
}
