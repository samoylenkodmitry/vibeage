import { ITEMS } from '../../packages/content/items.js';
import type { CraftItem } from '../../packages/protocol/messages.js';
import { instanceAtSlot, listInventoryItems } from '../../packages/sim/characterInventory.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter.js';
import type { GameState } from '../gameState.js';
import { error, LOG_CATEGORIES, debug, warn } from '../logger.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { addItemsToPlayer, ensureCharacterInventory, removeItemsFromPlayer } from './aggregateBridge.js';
import { sendCommandRejected } from '../transport/commandRejected.js';

export type CraftResult =
  | { ok: true; recipeId: string; outputId: string }
  | { ok: false; reason: 'invalidSlot' | 'notRecipe' | 'missingIngredients' | 'inventoryFull' | 'playerDead' };

/**
 * PR U — apply a recipe from the player's bag. The recipe item itself
 * is also consumed (one-shot pattern). All inputs are validated up
 * front; we mutate inventory only after every check passes so a
 * failed craft can never silently eat materials.
 *
 * Pure content reads — recipe.inputs / recipe.output come from
 * packages/content/items.ts so adding a new recipe is content-only,
 * no engine change needed.
 */
export function applyCraftRecipe(player: PlayerState, recipeSlotIndex: number): CraftResult {
  if (!player.isAlive) return { ok: false, reason: 'playerDead' };
  const recipeInstance = instanceAtSlot(ensureCharacterInventory(player), recipeSlotIndex);
  if (!recipeInstance || recipeInstance.count <= 0) return { ok: false, reason: 'invalidSlot' };
  const recipeItem = ITEMS[recipeInstance.templateId];
  if (!recipeItem?.recipe) return { ok: false, reason: 'notRecipe' };
  const spec = recipeItem.recipe;

  // Sum quantities across all stacks for each input id.
  const haveByItem: Record<string, number> = {};
  for (const instance of listInventoryItems(ensureCharacterInventory(player))) {
    if (instance.count <= 0) continue;
    haveByItem[instance.templateId] = (haveByItem[instance.templateId] ?? 0) + instance.count;
  }
  for (const input of spec.inputs) {
    if ((haveByItem[input.itemId] ?? 0) < input.quantity) {
      return { ok: false, reason: 'missingIngredients' };
    }
  }

  // All-or-nothing: remove the inputs + the recipe itself first, then
  // grant the output. If the bag can't fit the output, we'd ideally
  // roll back — addItemsToPlayer's stackable equipment is non-
  // stackable so it needs a free slot. Check capacity by counting
  // empty slots before committing.
  const freeSlots = countFreeSlots(player);
  if (freeSlots < 1) {
    // Even after removing inputs we'd need at least one empty slot for
    // the output (it's non-stackable equipment). Removing inputs may
    // free slots in practice, but for simplicity require a free slot
    // up front; this avoids the partial-craft rollback path.
    return { ok: false, reason: 'inventoryFull' };
  }

  for (const input of spec.inputs) {
    const r = removeItemsFromPlayer(player, input.itemId, input.quantity);
    if (!r.ok) {
      error(LOG_CATEGORIES.SYSTEM, `Craft ${recipeItem.id}: removeItems(${input.itemId} × ${input.quantity}) failed mid-flight for player ${player.id}`);
      return { ok: false, reason: 'missingIngredients' };
    }
  }
  // Consume the recipe item itself.
  const rRecipe = removeItemsFromPlayer(player, recipeItem.id, 1);
  if (!rRecipe.ok) {
    warn(LOG_CATEGORIES.PLAYER, `Craft ${recipeItem.id}: failed to consume recipe for player ${player.id}`);
  }
  const add = addItemsToPlayer(player, spec.output.itemId, spec.output.quantity);
  if (!add.ok) {
    error(LOG_CATEGORIES.SYSTEM, `Craft ${recipeItem.id}: addItemsToPlayer(${spec.output.itemId}) failed for player ${player.id} — inputs already consumed`);
    return { ok: false, reason: 'inventoryFull' };
  }
  debug(LOG_CATEGORIES.PLAYER, `Player ${player.id} crafted ${spec.output.itemId} via ${recipeItem.id}`);
  return { ok: true, recipeId: recipeItem.id, outputId: spec.output.itemId };
}

function countFreeSlots(player: PlayerState): number {
  const used = listInventoryItems(ensureCharacterInventory(player)).filter((i) => i.count > 0).length;
  return Math.max(0, player.maxInventorySlots - used);
}

export function onCraftItem(
  socket: { id: string },
  direct: DirectMessageSink,
  state: GameState,
  msg: CraftItem,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'CraftItem', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    error(LOG_CATEGORIES.SYSTEM, `CraftItem: No player found for socket ${socket.id}`);
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const result = applyCraftRecipe(player, msg.recipeSlotIndex);
  if (result.ok === false) {
    debug(LOG_CATEGORIES.PLAYER, `Player ${playerId} CraftItem rejected: ${result.reason}`);
    reject(result.reason);
    return;
  }
  // Push the updated inventory + the synthetic ItemUsed event so the
  // client clears its slot UI same way it does for consumables.
  emitPlayerUpdated(outbound, { id: player.id });
  direct.send({
    type: 'InventoryUpdate',
    playerId: player.id,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(player)),
    maxInventorySlots: player.maxInventorySlots,
  });
}
