import { describe, expect, test } from 'vitest';
import {
  createEmptyInventory,
  validateInvariants,
} from '../packages/sim/characterInventory';
import { equipItem, unequipSlot } from '../packages/sim/equipTransactions';
import { addItems } from '../packages/sim/inventoryTransactions';

const limits = { baseSlots: 12, bonusSlots: 0, maxWeight: 100_000 };
const context = { level: 10, className: 'warrior' as const };

let counter = 0;
const services = () => ({
  instanceIdFactory: () => `id-${++counter}`,
  now: () => 1_000,
});

function inventoryWith(itemIds: readonly string[]) {
  const inv = createEmptyInventory('char-1', limits);
  for (const id of itemIds) {
    const result = addItems(inv, { templateId: id, count: 1 }, services());
    if (!result.ok) {
      throw new Error(`failed to seed ${id}`);
    }
  }
  return inv;
}

function instanceIdOf(inv: ReturnType<typeof inventoryWith>, templateId: string): string {
  const match = Object.values(inv.items).find((item) => item.templateId === templateId);
  if (!match) {
    throw new Error(`missing ${templateId}`);
  }
  return match.instanceId;
}

describe('equipItem basic flow', () => {
  test('one-handed sword fills MAIN_HAND and registers occupancy', () => {
    const inv = inventoryWith(['worn_sword']);
    const id = instanceIdOf(inv, 'worn_sword');
    const result = equipItem(inv, id, undefined, context);
    expect(result.ok).toBe(true);
    expect(inv.equipment.MAIN_HAND).toBe(id);
    expect(inv.occupancy.MAIN_HAND).toBe(id);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('two-handed staff occupies MAIN_HAND and OFF_HAND', () => {
    const inv = inventoryWith(['crystal_staff']);
    const id = instanceIdOf(inv, 'crystal_staff');
    const result = equipItem(inv, id, undefined, context);
    expect(result.ok).toBe(true);
    expect(inv.equipment.MAIN_HAND).toBe(id);
    expect(inv.occupancy.OFF_HAND).toBe(id);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('full-body armor occupies CHEST + LEGS', () => {
    const inv = inventoryWith(['plate_cuirass']);
    const id = instanceIdOf(inv, 'plate_cuirass');
    const result = equipItem(inv, id, undefined, context);
    expect(result.ok).toBe(true);
    expect(inv.equipment.CHEST).toBe(id);
    expect(inv.occupancy.CHEST).toBe(id);
    expect(inv.occupancy.LEGS).toBe(id);
    expect(inv.equipment.LEGS).toBeUndefined();
    expect(validateInvariants(inv)).toEqual([]);
  });
});

describe('equipItem replacement rules', () => {
  test('equipping a shield over a two-handed weapon fails with twoHandBlocksOffhand', () => {
    const inv = inventoryWith(['crystal_staff', 'wooden_shield']);
    const staff = instanceIdOf(inv, 'crystal_staff');
    const shield = instanceIdOf(inv, 'wooden_shield');
    expect(equipItem(inv, staff, undefined, context).ok).toBe(true);
    const result = equipItem(inv, shield, undefined, context);
    expect(result).toEqual({ ok: false, error: 'twoHandBlocksOffhand' });
    expect(inv.equipment.MAIN_HAND).toBe(staff);
  });

  test('equipping a two-handed weapon replaces both hands and refunds previous gear', () => {
    const inv = inventoryWith(['worn_sword', 'wooden_shield', 'crystal_staff']);
    const sword = instanceIdOf(inv, 'worn_sword');
    const shield = instanceIdOf(inv, 'wooden_shield');
    const staff = instanceIdOf(inv, 'crystal_staff');
    expect(equipItem(inv, sword, undefined, context).ok).toBe(true);
    expect(equipItem(inv, shield, undefined, context).ok).toBe(true);
    const result = equipItem(inv, staff, undefined, context);
    expect(result.ok).toBe(true);
    expect(inv.equipment.MAIN_HAND).toBe(staff);
    expect(inv.occupancy.OFF_HAND).toBe(staff);
    expect(inv.items[sword].location.kind).toBe('inventory');
    expect(inv.items[shield].location.kind).toBe('inventory');
  });

  test('full-body armor unequips an already-worn leg piece', () => {
    const inv = inventoryWith(['leather_pants', 'plate_cuirass']);
    const pants = instanceIdOf(inv, 'leather_pants');
    const plate = instanceIdOf(inv, 'plate_cuirass');
    expect(equipItem(inv, pants, undefined, context).ok).toBe(true);
    const result = equipItem(inv, plate, undefined, context);
    expect(result.ok).toBe(true);
    expect(inv.items[pants].location.kind).toBe('inventory');
    expect(inv.equipment.CHEST).toBe(plate);
    expect(inv.occupancy.LEGS).toBe(plate);
  });

  test('ring without a requested slot picks the empty hand first', () => {
    const inv = inventoryWith(['bone_ring', 'bone_ring']);
    const ids = Object.values(inv.items).map((item) => item.instanceId);
    expect(equipItem(inv, ids[0], undefined, context).ok).toBe(true);
    expect(inv.equipment.RING_LEFT).toBe(ids[0]);
    expect(equipItem(inv, ids[1], undefined, context).ok).toBe(true);
    expect(inv.equipment.RING_RIGHT).toBe(ids[1]);
  });
});

describe('unequipSlot', () => {
  test('unequipping a two-handed weapon via OFF_HAND removes the whole weapon', () => {
    const inv = inventoryWith(['crystal_staff']);
    const staff = instanceIdOf(inv, 'crystal_staff');
    expect(equipItem(inv, staff, undefined, context).ok).toBe(true);
    const result = unequipSlot(inv, 'OFF_HAND', context);
    expect(result.ok).toBe(true);
    expect(inv.equipment.MAIN_HAND).toBeUndefined();
    expect(inv.occupancy.MAIN_HAND).toBeUndefined();
    expect(inv.occupancy.OFF_HAND).toBeUndefined();
    expect(inv.items[staff].location.kind).toBe('inventory');
  });

  test('unequipping fails when the bag has no free slot', () => {
    const tight = { baseSlots: 1, bonusSlots: 0, maxWeight: 100_000 };
    const inv = createEmptyInventory('char-1', tight);
    const seeded = addItems(inv, { templateId: 'worn_sword', count: 1 }, services());
    if (!seeded.ok) throw new Error('seed failed');
    const sword = instanceIdOf(inv, 'worn_sword');
    expect(equipItem(inv, sword, undefined, context).ok).toBe(true);
    // The sword is now in MAIN_HAND. Fill the bag's only slot.
    addItems(inv, { templateId: 'gold_coin', count: 1 }, services());
    const result = unequipSlot(inv, 'MAIN_HAND', context);
    expect(result).toEqual({ ok: false, error: 'inventoryFullForUnequippedItems' });
    expect(inv.equipment.MAIN_HAND).toBe(sword);
  });
});
