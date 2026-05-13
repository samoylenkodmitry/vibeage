import { describe, expect, test } from 'vitest';
import {
  addItemsToInventory,
  addItemsToInventoryWithOverflow,
  dropsToInventorySlots,
} from '../server/inventory/inventorySlots';

describe('inventory slots', () => {
  test('converts positive drops into inventory slots', () => {
    expect(dropsToInventorySlots([
      { itemId: 'gold_coin', quantity: 3 },
      { itemId: 'health_potion', quantity: 0 },
    ])).toEqual([{ itemId: 'gold_coin', quantity: 3 }]);
  });

  test('fills existing stacks and creates a new stack when max stack is reached', () => {
    const result = addItemsToInventory(
      [{ itemId: 'health_potion', quantity: 19 }],
      [{ itemId: 'health_potion', quantity: 3 }],
      2,
    );

    expect(result).toEqual({
      ok: true,
      inventory: [
        { itemId: 'health_potion', quantity: 20 },
        { itemId: 'health_potion', quantity: 2 },
      ],
      addedItems: [
        { itemId: 'health_potion', quantity: 1 },
        { itemId: 'health_potion', quantity: 2 },
      ],
    });
  });

  test('rejects all-or-nothing pickup when the stack is full and no slot is free', () => {
    const originalInventory = [{ itemId: 'health_potion', quantity: 20 }];
    const result = addItemsToInventory(
      originalInventory,
      [{ itemId: 'health_potion', quantity: 1 }],
      1,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'inventoryFull',
      inventory: originalInventory,
      rejectedItem: { itemId: 'health_potion', quantity: 1 },
    });
  });

  test('places non-stackable items into separate slots and reports overflow', () => {
    const result = addItemsToInventoryWithOverflow(
      [],
      [{ itemId: 'worn_sword', quantity: 2 }],
      1,
    );

    expect(result).toEqual({
      inventory: [{ itemId: 'worn_sword', quantity: 1 }],
      addedItems: [{ itemId: 'worn_sword', quantity: 1 }],
      overflowItems: [{ itemId: 'worn_sword', quantity: 1 }],
    });
  });
});
