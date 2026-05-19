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
 *
 * PR GG — `gold_coin` is the currency template, not bag inventory. Every
 * loot table drops it, but it would be noise to carry stacks of coins
 * around. Intercept here and credit the player's `gold` counter directly
 * so a single code path keeps the bag clean.
 */
export function addItemsToPlayer(player: PlayerState, templateId: string, count: number) {
  if (templateId === 'gold_coin') {
    player.gold = (player.gold ?? 0) + count;
    return { ok: true as const, value: { added: [], changed: [] } };
  }
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

/**
 * Snapshot the player's aggregate + legacy inventory so a multi-step
 * transaction (e.g., loot pickup that adds several drops) can roll back
 * atomically when any step fails.
 */
export function snapshotInventory(player: PlayerState) {
  const aggregate = ensureCharacterInventory(player);
  return {
    aggregate: {
      characterId: aggregate.characterId,
      items: Object.fromEntries(
        Object.entries(aggregate.items).map(([id, instance]) => [
          id,
          { ...instance, location: { ...instance.location } },
        ]),
      ),
      equipment: { ...aggregate.equipment },
      occupancy: { ...aggregate.occupancy },
      limits: aggregate.limits,
    },
    legacy: player.inventory.map((slot) => ({ ...slot })),
    // PR GG — capture the gold counter so a partial loot pickup that
    // includes coin drops can roll back the credit. Without this,
    // a failed pickup leaves the gold on the player *and* the pile
    // on the ground = duplication.
    gold: player.gold ?? 0,
  };
}

export function restoreInventory(player: PlayerState, snapshot: ReturnType<typeof snapshotInventory>): void {
  player.characterInventory = snapshot.aggregate;
  player.inventory = snapshot.legacy;
  player.gold = snapshot.gold;
}

/**
 * Attach a persisted CharacterInventory aggregate back to a freshly
 * hydrated player. Tolerates the row column being null (pre-migration
 * rows, or any player that hasn't equipped anything yet) — the caller
 * falls back to building from the legacy bag in that case.
 */
export function hydratePersistedCharacterInventory(
  player: PlayerState,
  raw: unknown,
): void {
  if (!raw || typeof raw !== 'object') {
    return;
  }
  const aggregate = raw as CharacterInventory;
  if (!aggregate.items || !aggregate.equipment || !aggregate.occupancy) {
    return;
  }
  player.characterInventory = aggregate;
  // Project the bag view back onto the legacy `inventory` field so the
  // existing wire/persistence consumers see the right item list.
  syncLegacyInventory(player);
}
