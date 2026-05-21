import { flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter';
import type { PlayerState } from '../../packages/sim/entities';
import type { InventorySlot } from '../../packages/protocol/messages';

/**
 * §52/PR-queue-#2 test helper — after the legacy `player.inventory`
 * mirror was retired, tests that want to assert against the
 * flat-slot view of the bag should call this. Equivalent to the
 * wire emit (`emitInventoryUpdate` calls the same flatten on its
 * way to `InventoryUpdate.inventory`), so tests still see what the
 * client would see.
 *
 * Returns `[]` for fixtures that didn't seed a `characterInventory`.
 */
export function playerInventorySlots(player: PlayerState): InventorySlot[] {
  if (!player.characterInventory) return [];
  return flattenInventoryToSlots(player.characterInventory);
}

/** Convenience: find an inventory slot index by template id, or -1. */
export function findInventorySlotIndex(player: PlayerState, itemId: string): number {
  return playerInventorySlots(player).findIndex((s) => s?.itemId === itemId);
}

/** Convenience: get an inventory slot entry by template id, or undefined. */
export function findInventorySlot(player: PlayerState, itemId: string): InventorySlot | undefined {
  return playerInventorySlots(player).find((s) => s?.itemId === itemId);
}
