import { nanoid } from 'nanoid';
import type { CharacterInventory } from '../../packages/sim/characterInventory.js';
import { createEmptyInventory } from '../../packages/sim/characterInventory.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { addItems, removeItems } from '../../packages/sim/inventoryTransactions.js';

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
 *
 * §52 #2 — the legacy `player.inventory` mirror has been retired;
 * the forward-migration branch (slot list → aggregate) that used
 * to live here is gone. Test fixtures now either populate
 * `characterInventory` directly OR call `addItemsToPlayer` which
 * routes through this helper.
 */
export function ensureCharacterInventory(player: PlayerState): CharacterInventory {
  if (!player.characterInventory) {
    player.characterInventory = emptyAggregateForPlayer(player);
  }
  return player.characterInventory;
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
 *
 * §52/PR-queue-#2 — the legacy `player.inventory` mirror is gone.
 * `flattenInventoryToSlots(ensureCharacterInventory(player))` is
 * called only at wire-emit time now (`emitInventoryUpdate` +
 * `emitPlayerUpdated` patches that include inventory).
 */
export function addItemsToPlayer(player: PlayerState, templateId: string, count: number) {
  if (templateId === 'gold_coin') {
    if (count > 0) {
      player.gold = (player.gold ?? 0) + count;
    }
    return { ok: true as const, value: { added: [], changed: [] } };
  }
  return addItems(ensureCharacterInventory(player), { templateId, count }, services());
}

export function removeItemsFromPlayer(player: PlayerState, templateId: string, count: number) {
  return removeItems(ensureCharacterInventory(player), templateId, count, services());
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
}

/**
 * Attach a persisted CharacterInventory aggregate back to a freshly
 * hydrated player. Tolerates the row column being null (any player
 * that hasn't been persisted yet) — the caller seeds an empty
 * aggregate in that case.
 *
 * Repairs `limits.baseSlots` when the persisted value is missing,
 * zero, or NaN — without this, `maxInventorySlotCount` returns
 * 0/NaN and every `addItems` rejects with `inventoryFull` (looks
 * like a perpetually full bag). `player.maxInventorySlots` is the
 * source of truth for the cap.
 */
export function hydratePersistedCharacterInventory(
  player: PlayerState,
  raw: unknown,
): void {
  if (!raw || typeof raw !== 'object') return;
  const aggregate = raw as CharacterInventory;
  if (!aggregate.items || !aggregate.equipment || !aggregate.occupancy) return;
  aggregate.limits = repairInventoryLimits(aggregate.limits, player.maxInventorySlots);
  player.characterInventory = aggregate;
}

function repairInventoryLimits(
  raw: CharacterInventory['limits'] | undefined,
  fallbackBaseSlots: number,
): CharacterInventory['limits'] {
  const baseFromPlayer = fallbackBaseSlots > 0 ? fallbackBaseSlots : DEFAULT_LIMITS.baseSlots;
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LIMITS, baseSlots: baseFromPlayer };
  }
  return {
    baseSlots: Number.isFinite(raw.baseSlots) && raw.baseSlots > 0 ? raw.baseSlots : baseFromPlayer,
    bonusSlots: Number.isFinite(raw.bonusSlots) && raw.bonusSlots >= 0 ? raw.bonusSlots : DEFAULT_LIMITS.bonusSlots,
    // Weight cap is unused (the addItems check that read it was
    // removed); kept on the type for back-compat with persisted
    // rows. Just copy whatever was there.
    maxWeight: typeof raw.maxWeight === 'number' ? raw.maxWeight : DEFAULT_LIMITS.maxWeight,
  };
}
