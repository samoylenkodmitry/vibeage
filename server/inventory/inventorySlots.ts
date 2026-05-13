import type { InventorySlot, ItemDrop } from '../../packages/protocol/messages.js';

export type AddInventoryItemsResult =
  | {
      ok: true;
      inventory: InventorySlot[];
      addedItems: InventorySlot[];
    }
  | {
      ok: false;
      reason: 'inventoryFull';
      inventory: InventorySlot[];
      rejectedItem: InventorySlot;
    };

export function dropsToInventorySlots(drops: ItemDrop[]): InventorySlot[] {
  return drops
    .filter((drop) => drop.quantity > 0)
    .map((drop) => ({
      itemId: drop.itemId,
      quantity: drop.quantity,
    }));
}

export function addItemsToInventory(
  inventory: InventorySlot[],
  items: InventorySlot[],
  maxSlots: number,
): AddInventoryItemsResult {
  const nextInventory = inventory.map((slot) => ({ ...slot }));
  const addedItems: InventorySlot[] = [];

  for (const item of items) {
    const existingSlot = nextInventory.find((slot) => slot.itemId === item.itemId);

    if (existingSlot) {
      existingSlot.quantity += item.quantity;
      addedItems.push({ ...item });
      continue;
    }

    if (nextInventory.length >= maxSlots) {
      return {
        ok: false,
        reason: 'inventoryFull',
        inventory,
        rejectedItem: item,
      };
    }

    nextInventory.push({ ...item });
    addedItems.push({ ...item });
  }

  return {
    ok: true,
    inventory: nextInventory,
    addedItems,
  };
}
