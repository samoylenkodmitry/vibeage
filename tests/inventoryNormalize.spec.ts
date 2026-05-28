import { describe, expect, test } from 'vitest';
import { createEmptyInventory, listInventoryItems, validateInvariants } from '../packages/sim/characterInventory';
import { normalizeInventory } from '../packages/sim/inventoryTransactions';
import { inventoryLocation, type ItemInstance } from '../packages/sim/itemInstance';
import { MATERIAL_MAX_STACK } from '../packages/content/items';

const limits = { baseSlots: 20, bonusSlots: 0, maxWeight: 100_000 };

let idCounter = 0;
const services = () => ({ instanceIdFactory: () => `norm-${++idCounter}`, now: () => 1_000 });

function bagInstance(overrides: Partial<ItemInstance> & { instanceId: string; slotIndex: number }): ItemInstance {
  return {
    ownerId: 'char-1',
    templateId: 'fire_gem',
    count: 1,
    enchantLevel: 0,
    bound: false,
    createdAtTs: 0,
    ...overrides,
    location: inventoryLocation(overrides.slotIndex),
  };
}

function inventoryWith(instances: ItemInstance[]) {
  const inv = createEmptyInventory('char-1', limits);
  for (const inst of instances) inv.items[inst.instanceId] = inst;
  return inv;
}

describe('bag invariants (validateInvariants)', () => {
  test('flags two partial stacks of the same item kind', () => {
    const inv = inventoryWith([
      bagInstance({ instanceId: 'a', count: 15, slotIndex: 0 }),
      bagInstance({ instanceId: 'b', count: 15, slotIndex: 1 }),
    ]);
    const violations = validateInvariants(inv);
    expect(violations.some((v) => v.includes('both partial stacks of fire_gem'))).toBe(true);
  });

  test('two full stacks of the same kind are allowed', () => {
    const inv = inventoryWith([
      bagInstance({ instanceId: 'a', count: MATERIAL_MAX_STACK, slotIndex: 0 }),
      bagInstance({ instanceId: 'b', count: MATERIAL_MAX_STACK, slotIndex: 1 }),
    ]);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('flags two items sharing a bag slot', () => {
    const inv = inventoryWith([
      bagInstance({ instanceId: 'a', templateId: 'worn_sword', count: 1, slotIndex: 3 }),
      bagInstance({ instanceId: 'b', templateId: 'crystal_staff', count: 1, slotIndex: 3 }),
    ]);
    expect(validateInvariants(inv).some((v) => v.includes('bag slot 3 is held by both'))).toBe(true);
  });

  test('flags an out-of-range bag slot', () => {
    const inv = inventoryWith([bagInstance({ instanceId: 'a', templateId: 'worn_sword', count: 1, slotIndex: 999 })]);
    expect(validateInvariants(inv).some((v) => v.includes('invalid bag slotIndex 999'))).toBe(true);
  });
});

describe('normalizeInventory — persistence boundary repair', () => {
  test('merges two partial stacks of the same material into one slot', () => {
    const inv = inventoryWith([
      bagInstance({ instanceId: 'a', count: 15, slotIndex: 0 }),
      bagInstance({ instanceId: 'b', count: 15, slotIndex: 1 }),
    ]);
    normalizeInventory(inv, services());
    const counts = listInventoryItems(inv).map((i) => i.count).sort((x, y) => y - x);
    expect(counts).toEqual([30]); // materials stack to MATERIAL_MAX_STACK (one slot)
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('two Fire Gem stacks (the a-a [16,26] report) consolidate to a single 42 slot', () => {
    const inv = inventoryWith([
      bagInstance({ instanceId: 'a', count: 16, slotIndex: 0 }),
      bagInstance({ instanceId: 'b', count: 26, slotIndex: 3 }),
    ]);
    normalizeInventory(inv, services());
    const stacks = listInventoryItems(inv).filter((i) => i.templateId === 'fire_gem');
    expect(stacks).toHaveLength(1);
    expect(stacks[0].count).toBe(42);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('merges legacy instances with missing enchant/bound fields', () => {
    // Simulate persisted rows predating the enchantLevel/bound fields.
    const legacy = {
      instanceId: 'legacy', ownerId: 'char-1', templateId: 'fire_gem', count: 10,
      location: inventoryLocation(0), createdAtTs: 0,
    } as unknown as ItemInstance;
    const fresh = bagInstance({ instanceId: 'fresh', count: 10, slotIndex: 1 });
    const inv = inventoryWith([legacy, fresh]);
    normalizeInventory(inv, services());
    const stacks = listInventoryItems(inv).filter((i) => i.templateId === 'fire_gem');
    expect(stacks).toHaveLength(1);
    expect(stacks[0].count).toBe(20);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('splits a stack left over maxStack by a content rebalance', () => {
    // fire_gem maxStack is MATERIAL_MAX_STACK (999); a stack above it
    // (legacy / lowered cap) splits into max + remainder.
    const inv = inventoryWith([bagInstance({ instanceId: 'a', count: 1100, slotIndex: 0 })]);
    normalizeInventory(inv, services());
    const counts = listInventoryItems(inv).map((i) => i.count).sort((x, y) => y - x);
    expect(counts).toEqual([999, 101]);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('re-slots items that collide on the same bag slot', () => {
    const inv = inventoryWith([
      bagInstance({ instanceId: 'a', templateId: 'worn_sword', count: 1, slotIndex: 2 }),
      bagInstance({ instanceId: 'b', templateId: 'crystal_staff', count: 1, slotIndex: 2 }),
    ]);
    normalizeInventory(inv, services());
    const slots = listInventoryItems(inv)
      .map((i) => (i.location.kind === 'inventory' ? i.location.slotIndex : undefined))
      .sort();
    expect(new Set(slots).size).toBe(2); // no collision
    expect(validateInvariants(inv)).toEqual([]);
  });
});
