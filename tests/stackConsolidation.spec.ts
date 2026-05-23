import { describe, expect, it } from 'vitest';
import { addItems, consolidateStacks } from '../packages/sim/inventoryTransactions';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import { inventoryLocation } from '../packages/sim/itemInstance';
import { ITEMS } from '../packages/content/items';

/**
 * User: "some items are not stacked in the same slot even so they
 * are numbered, like 5x potions and 15 potions of the same type in
 * two separate slots. why this is not strict?"
 *
 * `consolidateStacks` is the single enforcement point of the
 * invariant: at most one NON-FULL stack per `(templateId,
 * enchantLevel, bound)` in the bag. Runs after every `addItems`,
 * so the moment a same-kind stack pair would exist it gets merged.
 */
function services() {
  let id = 0;
  return { instanceIdFactory: () => `inst-${id++}`, now: () => 1, templates: ITEMS };
}

describe('stack consolidation invariant', () => {
  it('addItems folds new quantity into the existing same-template stack — no split', () => {
    const inv = createEmptyInventory('c1', { baseSlots: 20, bonusSlots: 0, maxWeight: 9_999_999 });
    // Seed two pre-existing stacks of health_potion in different slots (legacy bag state).
    inv.items['a'] = {
      instanceId: 'a', ownerId: 'c1', templateId: 'health_potion',
      location: inventoryLocation(2), count: 5, enchantLevel: 0, bound: false, createdAtTs: 1,
    };
    inv.items['b'] = {
      instanceId: 'b', ownerId: 'c1', templateId: 'health_potion',
      location: inventoryLocation(7), count: 15, enchantLevel: 0, bound: false, createdAtTs: 1,
    };
    consolidateStacks(inv, ITEMS);
    const potions = Object.values(inv.items).filter((i) => i.templateId === 'health_potion');
    expect(potions.length).toBe(1);
    expect(potions[0].count).toBe(20);
    // The lower-index stack survives — predictable layout.
    expect(potions[0].location.kind === 'inventory' && potions[0].location.slotIndex).toBe(2);
  });

  it('addItems never creates a second stack when one with room exists', () => {
    const inv = createEmptyInventory('c1', { baseSlots: 20, bonusSlots: 0, maxWeight: 9_999_999 });
    inv.items['a'] = {
      instanceId: 'a', ownerId: 'c1', templateId: 'health_potion',
      location: inventoryLocation(2), count: 5, enchantLevel: 0, bound: false, createdAtTs: 1,
    };
    const result = addItems(inv, { templateId: 'health_potion', count: 3 }, services());
    expect(result.ok).toBe(true);
    const potions = Object.values(inv.items).filter((i) => i.templateId === 'health_potion');
    expect(potions.length).toBe(1);
    expect(potions[0].count).toBe(8);
  });

  it('stacks beyond maxStack overflow into a second stack — but at most one non-full stack remains', () => {
    const inv = createEmptyInventory('c1', { baseSlots: 20, bonusSlots: 0, maxWeight: 9_999_999 });
    const maxStack = ITEMS.health_potion.maxStack ?? 99;
    inv.items['a'] = {
      instanceId: 'a', ownerId: 'c1', templateId: 'health_potion',
      location: inventoryLocation(2), count: maxStack, enchantLevel: 0, bound: false, createdAtTs: 1,
    };
    const result = addItems(inv, { templateId: 'health_potion', count: 5 }, services());
    expect(result.ok).toBe(true);
    const potions = Object.values(inv.items).filter((i) => i.templateId === 'health_potion');
    expect(potions.length).toBe(2);
    const partial = potions.filter((p) => p.count < maxStack);
    expect(partial.length).toBe(1);
    expect(partial[0].count).toBe(5);
  });
});
