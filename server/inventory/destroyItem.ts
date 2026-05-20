import type { DestroyItem } from '../../packages/protocol/messages.js';
import { instanceAtSlot } from '../../packages/sim/characterInventory.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import type { GameState } from '../gameState.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import type { DirectMessageSink } from '../transport/outboundEvents.js';
import { ensureCharacterInventory, removeItemsFromPlayer } from './aggregateBridge.js';
import { emitInventoryUpdate } from '../world/clientMessageRouter.js';

type DestroyItemClient = { id: string };

/**
 * Bag context menu — Destroy. Removes a stack (or partial count)
 * from the caller's bag without spawning ground loot. Same auth +
 * clamp rules as DropItem; just skips the loot spawn so the item
 * is gone for good.
 */
export function onDestroyItem(
  socket: DestroyItemClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: DestroyItem,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    warn(LOG_CATEGORIES.PLAYER, `DestroyItem rejected: no player for socket ${socket.id}`);
    return;
  }
  const player = state.players[playerId];
  if (!player) return;
  if (!player.isAlive) {
    warn(LOG_CATEGORIES.PLAYER, `DestroyItem rejected: player ${playerId} is dead`);
    return;
  }

  const instance = instanceAtSlot(ensureCharacterInventory(player), msg.slotIndex);
  if (!instance) {
    warn(LOG_CATEGORIES.PLAYER, `DestroyItem rejected: empty slot ${msg.slotIndex} for ${playerId}`);
    return;
  }

  const destroyedCount = Math.min(msg.count ?? instance.count, instance.count);
  if (destroyedCount <= 0) return;

  const removed = removeItemsFromPlayer(player, instance.templateId, destroyedCount);
  if (removed.ok === false) {
    warn(LOG_CATEGORIES.PLAYER, `DestroyItem failed during remove for ${playerId}: ${removed.error}`);
    return;
  }

  debug(LOG_CATEGORIES.LOOT, `Player ${playerId} destroyed ${destroyedCount}× ${instance.templateId}`);
  emitInventoryUpdate(direct, player);
}
