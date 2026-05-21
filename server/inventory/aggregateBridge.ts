import { nanoid } from 'nanoid';
import type { CharacterInventory } from '../../packages/sim/characterInventory.js';
import { createEmptyInventory } from '../../packages/sim/characterInventory.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { addItems, removeItems } from '../../packages/sim/inventoryTransactions.js';
import { buildInventoryFromSlots, flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter.js';

const DEFAULT_LIMITS = { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 };

const services = () => ({
  instanceIdFactory: () => `inst-${nanoid(10)}`,
  now: () => Date.now(),
});

/**
 * §45.7 — every PlayerState constructed by production paths
 * (createTransientPlayer + hydratePersistedPlayer) carries
 * `characterInventory`. Tests may build partial fixtures without it
 * for non-inventory scenarios; this helper lazy-initialises an empty
 * aggregate in that case so the rest of the inventory pipeline can
 * assume a present field.
 */
export function ensureCharacterInventory(player: PlayerState): CharacterInventory {
  if (!player.characterInventory) {
    // §45.7 — fixtures that seed `player.inventory = [...]`
    // without a characterInventory get forward-migrated here, the
    // same way persistence does on hydrate. Production
    // construction paths always populate the aggregate so this is
    // a no-op for them.
    const legacy = player.inventory ?? [];
    player.characterInventory = legacy.length > 0
      ? buildInventoryFromSlots({
          characterId: player.id,
          slots: legacy,
          limits: { ...DEFAULT_LIMITS, baseSlots: player.maxInventorySlots ?? DEFAULT_LIMITS.baseSlots },
          instanceIdFactory: services().instanceIdFactory,
        })
      : emptyAggregateForPlayer(player);
  }
  return player.characterInventory;
}

/**
 * §45.7 — `player.inventory` is no longer the source of truth, but
 * it remains as a wire-projection mirror until a proper snapshot
 * boundary lands. Mutators call this after touching the aggregate
 * so legacy readers (tests, the InventoryUpdate wire emitter) see
 * the same shape they always did. New code should read from
 * `player.characterInventory` directly.
 */
export function syncLegacyInventory(player: PlayerState): void {
  if (!player.characterInventory) return;
  player.inventory = flattenInventoryToSlots(player.characterInventory);
}

/**
 * Push an item into the player's aggregate. Returns the same
 * TransactionResult shape as addItems so callers can branch on
 * success.
 *
 * PR GG — `gold_coin` is the currency template, not bag inventory.
 * Every loot table drops it, but it would be noise to carry stacks
 * of coins around. Intercept here and credit the player's `gold`
 * counter directly so a single code path keeps the bag clean.
 */
export function addItemsToPlayer(player: PlayerState, templateId: string, count: number) {
  if (templateId === 'gold_coin') {
    if (count > 0) {
      player.gold = (player.gold ?? 0) + count;
    }
    return { ok: true as const, value: { added: [], changed: [] } };
  }
  const result = addItems(ensureCharacterInventory(player), { templateId, count }, services());
  if (result.ok) syncLegacyInventory(player);
  return result;
}

export function removeItemsFromPlayer(player: PlayerState, templateId: string, count: number) {
  const result = removeItems(ensureCharacterInventory(player), templateId, count, services());
  if (result.ok) syncLegacyInventory(player);
  return result;
}

export function emptyAggregateForPlayer(player: PlayerState): CharacterInventory {
  return createEmptyInventory(player.id, {
    ...DEFAULT_LIMITS,
    baseSlots: player.maxInventorySlots,
  });
}

/**
 * Snapshot the player's aggregate + gold so a multi-step transaction
 * (e.g., loot pickup that adds several drops) can roll back atomically
 * when any step fails.
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
    // PR GG — capture the gold counter so a partial loot pickup that
    // includes coin drops can roll back the credit.
    gold: player.gold ?? 0,
  };
}

export function restoreInventory(player: PlayerState, snapshot: ReturnType<typeof snapshotInventory>): void {
  player.characterInventory = snapshot.aggregate;
  player.gold = snapshot.gold;
  syncLegacyInventory(player);
}

/**
 * Attach a persisted CharacterInventory aggregate back to a freshly
 * hydrated player. Tolerates the row column being null (any player
 * that hasn't been persisted yet) — the caller seeds an empty
 * aggregate in that case.
 */
export function hydratePersistedCharacterInventory(
  player: PlayerState,
  raw: unknown,
): void {
  if (!raw || typeof raw !== 'object') return;
  const aggregate = raw as CharacterInventory;
  if (!aggregate.items || !aggregate.equipment || !aggregate.occupancy) return;
  player.characterInventory = aggregate;
  syncLegacyInventory(player);
}
