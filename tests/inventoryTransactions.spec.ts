import { describe, expect, test } from 'vitest';
import { createEmptyInventory, listInventoryItems, validateInvariants } from '../packages/sim/characterInventory';
import {
  addItems,
  mergeStacks,
  moveSlot,
  removeItems,
  splitStack,
  totalInventoryWeight,
} from '../packages/sim/inventoryTransactions';

const limits = { baseSlots: 10, bonusSlots: 0, maxWeight: 100_000 };

function freshInventory() {
  return createEmptyInventory('char-1', limits);
}

let idCounter = 0;
const services = () => ({
  instanceIdFactory: () => `id-${++idCounter}`,
  now: () => 1_000,
});

describe('addItems', () => {
  test('fills existing stacks before opening new ones', () => {
    const inv = freshInventory();
    const first = addItems(inv, { templateId: 'health_potion', count: 18 }, services());
    expect(first.ok).toBe(true);
    const second = addItems(inv, { templateId: 'health_potion', count: 5 }, services());
    expect(second.ok).toBe(true);
    const stacks = listInventoryItems(inv).filter((item) => item.templateId === 'health_potion');
    expect(stacks).toHaveLength(2);
    expect(stacks[0].count).toBe(20);
    expect(stacks[1].count).toBe(3);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('non-stackable items get a fresh instance each', () => {
    const inv = freshInventory();
    const result = addItems(inv, { templateId: 'worn_sword', count: 3 }, services());
    expect(result.ok).toBe(true);
    const swords = listInventoryItems(inv).filter((item) => item.templateId === 'worn_sword');
    expect(swords).toHaveLength(3);
    expect(swords.every((item) => item.count === 1)).toBe(true);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('refuses to commit when slot cap would be exceeded', () => {
    const tightLimits = { baseSlots: 2, bonusSlots: 0, maxWeight: 100_000 };
    const inv = createEmptyInventory('char-1', tightLimits);
    const result = addItems(inv, { templateId: 'worn_sword', count: 3 }, services());
    expect(result).toEqual({ ok: false, error: 'inventoryFull' });
    expect(listInventoryItems(inv)).toHaveLength(0);
  });

  test('refuses to commit when weight cap would be exceeded', () => {
    const tinyLimits = { baseSlots: 10, bonusSlots: 0, maxWeight: 2000 };
    const inv = createEmptyInventory('char-1', tinyLimits);
    const result = addItems(inv, { templateId: 'worn_sword', count: 3 }, services());
    expect(result).toEqual({ ok: false, error: 'overweight' });
  });
});

describe('removeItems', () => {
  test('drains across multiple stacks and deletes empty ones', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'health_potion', count: 25 }, services()); // becomes 20 + 5
    const result = removeItems(inv, 'health_potion', 22, services());
    expect(result.ok).toBe(true);
    const remaining = listInventoryItems(inv).filter((item) => item.templateId === 'health_potion');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].count).toBe(3);
  });

  test('fails atomically when not enough is available', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'health_potion', count: 5 }, services());
    const result = removeItems(inv, 'health_potion', 6, services());
    expect(result.ok).toBe(false);
    const remaining = listInventoryItems(inv).filter((item) => item.templateId === 'health_potion');
    expect(remaining[0].count).toBe(5);
  });
});

describe('splitStack / mergeStacks', () => {
  test('splitStack creates a new instance with the requested amount', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'health_potion', count: 10 }, services());
    const source = listInventoryItems(inv)[0];
    const result = splitStack(inv, source.instanceId, 4, services());
    expect(result.ok).toBe(true);
    const stacks = listInventoryItems(inv);
    const counts = stacks.map((item) => item.count).sort();
    expect(counts).toEqual([4, 6]);
  });

  test('splitStack rejects invalid amount', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'health_potion', count: 5 }, services());
    const source = listInventoryItems(inv)[0];
    const tooMuch = splitStack(inv, source.instanceId, 5, services());
    expect(tooMuch.ok).toBe(false);
    const zero = splitStack(inv, source.instanceId, 0, services());
    expect(zero.ok).toBe(false);
  });

  test('mergeStacks honours maxStack and refuses overflow', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'health_potion', count: 30 }, services()); // becomes 20 + 10
    const stacks = listInventoryItems(inv);
    const overflow = mergeStacks(inv, stacks[1].instanceId, stacks[0].instanceId, services());
    expect(overflow).toEqual({ ok: false, error: 'stackOverflow' });
    expect(stacks[0].count).toBe(20);
    expect(stacks[1].count).toBe(10);
  });

  test('mergeStacks combines compatible stacks', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'gold_coin', count: 50 }, services());
    addItems(inv, { templateId: 'gold_coin', count: 30 }, services());
    // gold_coin maxStack is 9999 so the second add fills the first stack to 80.
    const after = listInventoryItems(inv);
    expect(after).toHaveLength(1);
    expect(after[0].count).toBe(80);
  });
});

describe('moveSlot', () => {
  test('swaps two stacks within the bag', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'health_potion', count: 1 }, services());
    addItems(inv, { templateId: 'gold_coin', count: 1 }, services());
    const [potion, coin] = listInventoryItems(inv);
    moveSlot(inv, coin.instanceId, 0);
    const reordered = listInventoryItems(inv);
    expect(reordered[0].templateId).toBe('gold_coin');
    expect(reordered[1].templateId).toBe('health_potion');
    expect(reordered[0].instanceId).toBe(coin.instanceId);
    expect(reordered[1].instanceId).toBe(potion.instanceId);
  });
});

describe('slot allocation with gaps', () => {
  test('addItems fills a freed-up slot before extending the tail', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'worn_sword', count: 3 }, services());
    const items = listInventoryItems(inv);
    // Carve a gap in the middle by destroying the slot-1 sword
    delete inv.items[items[1].instanceId];

    addItems(inv, { templateId: 'gold_coin', count: 5 }, services());
    const refreshed = listInventoryItems(inv);
    const gold = refreshed.find((item) => item.templateId === 'gold_coin');
    expect(gold).toBeDefined();
    expect(gold && gold.location.kind === 'inventory' && gold.location.slotIndex).toBe(1);
    expect(validateInvariants(inv)).toEqual([]);
  });

  test('splitStack picks the lowest free slot index when a gap is open', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'gold_coin', count: 50 }, services());
    addItems(inv, { templateId: 'worn_sword', count: 1 }, services());
    const items = listInventoryItems(inv);
    delete inv.items[items[1].instanceId];

    const stackItem = listInventoryItems(inv)[0];
    const result = splitStack(inv, stackItem.instanceId, 10, services());
    expect(result.ok).toBe(true);
    const refreshed = listInventoryItems(inv).find((item) => item.count === 10);
    expect(refreshed && refreshed.location.kind === 'inventory' && refreshed.location.slotIndex).toBe(1);
  });
});

describe('totalInventoryWeight', () => {
  test('sums weight across bag stacks', () => {
    const inv = freshInventory();
    addItems(inv, { templateId: 'worn_sword', count: 2 }, services());
    const weight = totalInventoryWeight(inv);
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBe(1500 * 2);
  });
});
