import { describe, expect, test } from 'vitest';
import {
  createEmptyInventory,
  entryForSlot,
  listInventoryItems,
  validateInvariants,
} from '../packages/sim/characterInventory';
import {
  destroyedLocation,
  equippedLocation,
  inventoryLocation,
  type ItemInstance,
} from '../packages/sim/itemInstance';
import {
  buildInventoryFromSlots,
  flattenInventoryToSlots,
} from '../packages/sim/inventoryWireAdapter';

const limits = { baseSlots: 20, bonusSlots: 0, maxWeight: 100_000 };

function instance(overrides: Partial<ItemInstance>): ItemInstance {
  return {
    instanceId: overrides.instanceId ?? 'item-1',
    ownerId: overrides.ownerId ?? 'char-1',
    templateId: overrides.templateId ?? 'worn_sword',
    location: overrides.location ?? inventoryLocation(0),
    count: overrides.count ?? 1,
    enchantLevel: overrides.enchantLevel ?? 0,
    bound: overrides.bound ?? false,
    createdAtTs: overrides.createdAtTs ?? 0,
  };
}

describe('character inventory invariants', () => {
  test('empty inventory has no violations', () => {
    const inv = createEmptyInventory('char-1', limits);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('equipped item must live in items map and have matching location', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.equipment.MAIN_HAND = 'item-1';
    inv.occupancy.MAIN_HAND = 'item-1';
    inv.items['item-1'] = instance({ location: equippedLocation('MAIN_HAND') });
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('orphaned equipment slot is flagged', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.equipment.MAIN_HAND = 'missing-instance';
    const violations = validateInvariants(inv);
    expect(violations).toContain('equipment slot MAIN_HAND references missing instance missing-instance');
  });

  test('equipped item location must match the slot', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.equipment.MAIN_HAND = 'item-1';
    inv.occupancy.MAIN_HAND = 'item-1';
    inv.items['item-1'] = instance({ location: equippedLocation('OFF_HAND') });
    const violations = validateInvariants(inv);
    expect(violations.some((v) => v.includes('equipped in MAIN_HAND'))).toBe(true);
  });

  test('owner mismatch is flagged', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['item-1'] = instance({ ownerId: 'someone-else' });
    expect(validateInvariants(inv)[0]).toContain('owned by someone-else');
  });

  test('destroyed items must not appear in the aggregate', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['item-1'] = instance({ location: destroyedLocation() });
    expect(validateInvariants(inv)[0]).toContain('destroyed but still present');
  });

  test('non-stackable items must have count 1', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['item-1'] = instance({ templateId: 'worn_sword', count: 3 });
    expect(validateInvariants(inv)[0]).toContain('non-stackable');
  });

  test('multi-slot two-handed weapon registers occupancy correctly', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['staff-1'] = instance({
      instanceId: 'staff-1',
      templateId: 'crystal_staff',
      location: equippedLocation('MAIN_HAND'),
    });
    inv.equipment.MAIN_HAND = 'staff-1';
    inv.occupancy.MAIN_HAND = 'staff-1';
    inv.occupancy.OFF_HAND = 'staff-1';

    expect(validateInvariants(inv)).toEqual([]);
    const entry = entryForSlot(inv, 'OFF_HAND');
    expect(entry?.instanceId).toBe('staff-1');
    expect(entry?.primarySlot).toBe('MAIN_HAND');
    expect(entry?.occupiedSlots).toEqual(['MAIN_HAND', 'OFF_HAND']);
  });

  test('two-handed weapon missing its OFF_HAND occupancy entry is flagged', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['staff-1'] = instance({
      instanceId: 'staff-1',
      templateId: 'crystal_staff',
      location: equippedLocation('MAIN_HAND'),
    });
    inv.equipment.MAIN_HAND = 'staff-1';
    inv.occupancy.MAIN_HAND = 'staff-1';
    // OFF_HAND occupancy missing — should be flagged
    const violations = validateInvariants(inv);
    expect(violations.some((v) => v.includes('should occupy OFF_HAND'))).toBe(true);
  });

  test('stackable item exceeding maxStack is flagged', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['stack-1'] = instance({
      instanceId: 'stack-1',
      templateId: 'health_potion',
      count: 999,
      location: inventoryLocation(0),
    });
    const violations = validateInvariants(inv);
    expect(violations.some((v) => v.includes('exceeds max stack'))).toBe(true);
  });

  test('occupancy slot pointing to an item whose spec does not cover it is flagged', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['sword-1'] = instance({
      instanceId: 'sword-1',
      templateId: 'worn_sword',
      location: equippedLocation('MAIN_HAND'),
    });
    inv.equipment.MAIN_HAND = 'sword-1';
    inv.occupancy.MAIN_HAND = 'sword-1';
    inv.occupancy.OFF_HAND = 'sword-1';
    const violations = validateInvariants(inv);
    expect(violations.some((v) => v.includes('does not cover OFF_HAND'))).toBe(true);
  });
});

describe('inventory wire adapter', () => {
  test('flattens bag items to legacy InventorySlot[] preserving order', () => {
    const inv = createEmptyInventory('char-1', limits);
    inv.items['a'] = instance({ instanceId: 'a', templateId: 'gold_coin', count: 50, location: inventoryLocation(0) });
    inv.items['b'] = instance({ instanceId: 'b', templateId: 'health_potion', count: 3, location: inventoryLocation(1) });
    inv.items['c'] = instance({ instanceId: 'c', templateId: 'worn_sword', count: 1, location: equippedLocation('MAIN_HAND') });

    const slots = flattenInventoryToSlots(inv);
    expect(slots).toEqual([
      { itemId: 'gold_coin', quantity: 50 },
      { itemId: 'health_potion', quantity: 3 },
    ]);
  });

  test('round-trips through buildInventoryFromSlots + flattenInventoryToSlots', () => {
    let i = 0;
    const inv = buildInventoryFromSlots({
      characterId: 'char-1',
      slots: [
        { itemId: 'gold_coin', quantity: 25 },
        { itemId: 'health_potion', quantity: 2 },
      ],
      limits,
      instanceIdFactory: () => `id-${i++}`,
    });

    expect(validateInvariants(inv)).toEqual([]);
    expect(listInventoryItems(inv)).toHaveLength(2);
    expect(flattenInventoryToSlots(inv)).toEqual([
      { itemId: 'gold_coin', quantity: 25 },
      { itemId: 'health_potion', quantity: 2 },
    ]);
  });
});
