import { QUEST_NPCS, INTERACTION_RANGE } from '../../packages/content/npcs.js';
import { ITEMS } from '../../packages/content/items.js';
import {
  VENDORS,
  vendorSellPriceFor,
  type VendorDef,
} from '../../packages/content/vendors.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { addItemsToPlayer, ensureCharacterInventory, removeItemsFromPlayer } from '../inventory/aggregateBridge.js';
import { flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter.js';
import { log, LOG_CATEGORIES, warn } from '../logger.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

/**
 * PR GG — vendor buy/sell server logic. Reads the same VENDORS
 * registry the wiki + dialog read so the runtime price is always
 * what the player saw before clicking. Validates proximity + gold
 * + inventory before mutating state.
 *
 * Buy: gold → item. Sell: item → gold. Each branch is a small
 * pure function that returns true on success so the router can
 * stay thin.
 */
function getVendor(vendorId: string): VendorDef | null {
  return VENDORS[vendorId] ?? null;
}

function nearVendor(player: PlayerState, vendor: VendorDef): boolean {
  const npc = QUEST_NPCS[vendor.npcId];
  if (!npc) return false;
  const d = distanceXZ(
    { x: player.position.x, z: player.position.z },
    { x: npc.position.x, z: npc.position.z },
  );
  return d <= INTERACTION_RANGE;
}

export type VendorResult =
  | { ok: true }
  | { ok: false; reason: string };

export function applyBuyFromVendor(
  player: PlayerState,
  vendorId: string,
  itemId: string,
  quantity: number,
  outbound: OutboundEventSink,
): VendorResult {
  const vendor = getVendor(vendorId);
  if (!vendor) return { ok: false, reason: 'unknownVendor' };
  if (!nearVendor(player, vendor)) return { ok: false, reason: 'tooFarFromVendor' };
  const entry = vendor.stock.find((s) => s.itemId === itemId);
  if (!entry) return { ok: false, reason: 'itemNotStocked' };
  if (!ITEMS[itemId]) return { ok: false, reason: 'unknownItem' };
  if (quantity < 1) return { ok: false, reason: 'invalidQuantity' };
  const totalCost = entry.price * quantity;
  if ((player.gold ?? 0) < totalCost) return { ok: false, reason: 'insufficientGold' };

  // Reserve the cost first so a failed add (bag full) leaves gold
  // untouched. Roll back on failure.
  const beforeGold = player.gold ?? 0;
  player.gold = beforeGold - totalCost;
  const result = addItemsToPlayer(player, itemId, quantity);
  if (!result.ok) {
    player.gold = beforeGold;
    return { ok: false, reason: 'inventoryFull' };
  }
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} bought ${quantity}x ${itemId} from ${vendorId} for ${totalCost}g`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    gold: player.gold,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(player)),
  });
  return { ok: true };
}

export function applySellToVendor(
  player: PlayerState,
  vendorId: string,
  itemId: string,
  quantity: number,
  outbound: OutboundEventSink,
): VendorResult {
  const vendor = getVendor(vendorId);
  if (!vendor) return { ok: false, reason: 'unknownVendor' };
  if (!nearVendor(player, vendor)) return { ok: false, reason: 'tooFarFromVendor' };
  if (quantity < 1) return { ok: false, reason: 'invalidQuantity' };
  const unitPrice = vendorSellPriceFor(vendor, itemId);
  if (unitPrice <= 0) {
    warn(LOG_CATEGORIES.PLAYER, `Sell rejected: vendor ${vendorId} doesn't buy ${itemId}`);
    return { ok: false, reason: 'vendorWontBuy' };
  }
  const removed = removeItemsFromPlayer(player, itemId, quantity);
  if (!removed.ok) return { ok: false, reason: 'itemNotInBag' };
  // `removed.value.removed` is the count actually taken — should equal
  // `quantity` because removeItems is atomic, but be defensive.
  const sold = removed.value.removed;
  const credit = unitPrice * sold;
  player.gold = (player.gold ?? 0) + credit;
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} sold ${sold}x ${itemId} to ${vendorId} for ${credit}g`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    gold: player.gold,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(player)),
  });
  return { ok: true };
}
