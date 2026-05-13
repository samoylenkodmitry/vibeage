import { ITEMS } from '../../packages/content/items.js';
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

export type InventoryOverflowResult = {
  inventory: InventorySlot[];
  addedItems: InventorySlot[];
  overflowItems: InventorySlot[];
};

type ItemStackRules = {
  stackable: boolean;
  maxStack: number;
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
  const result = addItemsToInventoryWithOverflow(inventory, items, maxSlots);
  const rejectedItem = result.overflowItems[0];

  if (rejectedItem) {
    return {
      ok: false,
      reason: 'inventoryFull',
      inventory,
      rejectedItem,
    };
  }

  return {
    ok: true,
    inventory: result.inventory,
    addedItems: result.addedItems,
  };
}

export function addItemsToInventoryWithOverflow(
  inventory: InventorySlot[],
  items: InventorySlot[],
  maxSlots: number,
): InventoryOverflowResult {
  const nextInventory = inventory.map((slot) => ({ ...slot }));
  const addedItems: InventorySlot[] = [];
  const overflowItems: InventorySlot[] = [];

  for (const item of items) {
    let remainingQuantity = item.quantity;
    const rules = getItemStackRules(item.itemId);

    if (rules.stackable) {
      remainingQuantity = fillExistingStacks(nextInventory, addedItems, item.itemId, remainingQuantity, rules.maxStack);
    }

    remainingQuantity = addNewStacks(nextInventory, addedItems, item.itemId, remainingQuantity, rules, maxSlots);
    if (remainingQuantity > 0) {
      overflowItems.push({ itemId: item.itemId, quantity: remainingQuantity });
    }
  }

  return {
    inventory: nextInventory,
    addedItems,
    overflowItems,
  };
}

function fillExistingStacks(
  inventory: InventorySlot[],
  addedItems: InventorySlot[],
  itemId: string,
  quantity: number,
  maxStack: number,
): number {
  let remainingQuantity = quantity;

  for (const slot of inventory) {
    if (slot.itemId !== itemId || slot.quantity >= maxStack || remainingQuantity <= 0) {
      continue;
    }

    const amountToAdd = Math.min(maxStack - slot.quantity, remainingQuantity);
    slot.quantity += amountToAdd;
    remainingQuantity -= amountToAdd;
    addedItems.push({ itemId, quantity: amountToAdd });
  }

  return remainingQuantity;
}

function addNewStacks(
  inventory: InventorySlot[],
  addedItems: InventorySlot[],
  itemId: string,
  quantity: number,
  rules: ItemStackRules,
  maxSlots: number,
): number {
  let remainingQuantity = quantity;

  while (remainingQuantity > 0 && inventory.length < maxSlots) {
    const amountForNewSlot = rules.stackable ? Math.min(remainingQuantity, rules.maxStack) : 1;
    inventory.push({ itemId, quantity: amountForNewSlot });
    addedItems.push({ itemId, quantity: amountForNewSlot });
    remainingQuantity -= amountForNewSlot;
  }

  return remainingQuantity;
}

function getItemStackRules(itemId: string): ItemStackRules {
  const itemDef = ITEMS[itemId];
  if (!itemDef) {
    return { stackable: true, maxStack: 999 };
  }

  return {
    stackable: itemDef.stackable,
    maxStack: itemDef.stackable ? itemDef.maxStack ?? 999 : 1,
  };
}
