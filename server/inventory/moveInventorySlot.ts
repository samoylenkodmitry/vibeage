import type { MoveInventorySlot } from '../../packages/protocol/messages.js';
import { instanceAtSlot } from '../../packages/sim/characterInventory.js';
import { moveSlot } from '../../packages/sim/inventoryTransactions.js';
import { LOG_CATEGORIES, warn } from '../logger.js';
import type { GameState } from '../gameState.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import type { DirectMessageSink } from '../transport/outboundEvents.js';
import { ensureCharacterInventory } from './aggregateBridge.js';
import { emitInventoryUpdate } from '../world/clientMessageRouter.js';

type MoveClient = { id: string };

/**
 * Drag-to-rearrange the bag. Resolve the item instance at the source
 * slot and apply the `moveSlot` transaction (which swaps with any
 * occupant of the target slot). Silent no-op on an empty source or an
 * out-of-range target — the client just sees no InventoryUpdate and
 * keeps the authoritative order. Persistence rides the periodic player
 * snapshot like every other inventory mutation.
 */
export function onMoveInventorySlot(
  socket: MoveClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: MoveInventorySlot,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player || msg.fromSlotIndex === msg.toSlotIndex) return;

  const inventory = ensureCharacterInventory(player);
  const instance = instanceAtSlot(inventory, msg.fromSlotIndex);
  if (!instance) return;

  const result = moveSlot(inventory, instance.instanceId, msg.toSlotIndex);
  if (result.ok === false) {
    warn(LOG_CATEGORIES.PLAYER, `MoveInventorySlot rejected for ${playerId}: ${result.error}`);
    return;
  }
  emitInventoryUpdate(direct, player);
}
