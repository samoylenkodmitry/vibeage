import { nanoid } from 'nanoid';
import { ITEMS } from '../../packages/content/items.js';
import type { CharacterInventory } from '../../packages/sim/characterInventory.js';
import { createEmptyInventory } from '../../packages/sim/characterInventory.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { addItems, removeItems } from '../../packages/sim/inventoryTransactions.js';
import {
  buildInventoryFromSlots,
  flattenInventoryToSlots,
} from '../../packages/sim/inventoryWireAdapter.js';

const DEFAULT_LIMITS = { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 };

const services = () => ({
  instanceIdFactory: () => `inst-${nanoid(10)}`,
  now: () => Date.now(),
});

/**
 * Returns the player's CharacterInventory aggregate, creating one from the
 * legacy InventorySlot[] field if a hydrated player doesn't have one yet.
 */
export function ensureCharacterInventory(player: PlayerState): CharacterInventory {
  if (!player.characterInventory) {
    player.characterInventory = buildInventoryFromSlots({
      characterId: player.id,
      slots: player.inventory,
      limits: { ...DEFAULT_LIMITS, baseSlots: player.maxInventorySlots },
      instanceIdFactory: services().instanceIdFactory,
    });
  }
  return player.characterInventory;
}

/**
 * After mutating the aggregate, re-project the bag into the legacy wire
 * format so existing protocol consumers (persistence, the client's inventory
 * panel) stay in sync until they migrate to the instance-aware shape.
 */
export function syncLegacyInventory(player: PlayerState): void {
  if (!player.characterInventory) {
    return;
  }
  player.inventory = flattenInventoryToSlots(player.characterInventory);
}

/**
 * Push an item into both the aggregate and the legacy slot list atomically.
 * Returns the same TransactionResult shape as addItems so callers can branch
 * on success without juggling two parallel data structures.
 */
export function addItemsToPlayer(player: PlayerState, templateId: string, count: number) {
  const aggregate = ensureCharacterInventory(player);
  const result = addItems(aggregate, { templateId, count }, services());
  if (result.ok) {
    syncLegacyInventory(player);
  }
  return result;
}

export function removeItemsFromPlayer(player: PlayerState, templateId: string, count: number) {
  const aggregate = ensureCharacterInventory(player);
  const result = removeItems(aggregate, templateId, count, services());
  if (result.ok) {
    syncLegacyInventory(player);
  }
  return result;
}

export const inventoryServices = services;

export function emptyAggregateForPlayer(player: PlayerState): CharacterInventory {
  return createEmptyInventory(player.id, {
    ...DEFAULT_LIMITS,
    baseSlots: player.maxInventorySlots,
  });
}

export function templateOf(templateId: string) {
  return ITEMS[templateId];
}
