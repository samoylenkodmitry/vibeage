import { describe, expect, test } from 'vitest';
import {
  EQUIPMENT_SETS,
  activeSetBonuses,
} from '../packages/content/equipmentSets';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import { deriveEquipmentStats } from '../packages/sim/equipmentStats';
import { equipItem } from '../packages/sim/equipTransactions';
import { addItems } from '../packages/sim/inventoryTransactions';

const limits = { baseSlots: 12, bonusSlots: 0, maxWeight: 100_000 };
const context = { level: 10, className: 'warrior' as const };

let counter = 0;
const services = () => ({
  instanceIdFactory: () => `id-${++counter}`,
  now: () => 1_000,
});

function buildInventory(itemIds: readonly string[]) {
  const inv = createEmptyInventory('char-1', limits);
  for (const id of itemIds) {
    const result = addItems(inv, { templateId: id, count: 1 }, services());
    if (!result.ok) {
      throw new Error(`failed to seed ${id}`);
    }
  }
  return inv;
}

function instanceIdOf(inv: ReturnType<typeof buildInventory>, templateId: string): string {
  const match = Object.values(inv.items).find((item) => item.templateId === templateId);
  if (!match) {
    throw new Error(`missing ${templateId}`);
  }
  return match.instanceId;
}

describe('deriveEquipmentStats', () => {
  test('sums stats across equipped items', () => {
    const inv = buildInventory(['worn_sword', 'leather_tunic']);
    equipItem(inv, instanceIdOf(inv, 'worn_sword'), undefined, context);
    equipItem(inv, instanceIdOf(inv, 'leather_tunic'), undefined, context);
    const stats = deriveEquipmentStats(inv);
    expect(stats.pAtk).toBe(5);
    expect(stats.pDef).toBe(8);
  });

  test('full leather set adds the 3-piece bonus', () => {
    const inv = buildInventory(['leather_helmet', 'leather_tunic', 'leather_pants']);
    equipItem(inv, instanceIdOf(inv, 'leather_helmet'), undefined, context);
    equipItem(inv, instanceIdOf(inv, 'leather_tunic'), undefined, context);
    equipItem(inv, instanceIdOf(inv, 'leather_pants'), undefined, context);
    const stats = deriveEquipmentStats(inv);
    // base pDef from the three pieces is 3 + 8 + 6 = 17, plus the 3-piece bonus pDef:4
    expect(stats.pDef).toBe(17 + 4);
    expect(stats.hp).toBe(20);
  });

  test('full 5-piece leather set triggers the higher tier bonus', () => {
    const inv = buildInventory([
      'leather_helmet', 'leather_tunic', 'leather_pants', 'leather_gloves', 'leather_boots',
    ]);
    for (const id of ['leather_helmet', 'leather_tunic', 'leather_pants', 'leather_gloves', 'leather_boots']) {
      equipItem(inv, instanceIdOf(inv, id), undefined, context);
    }
    const stats = deriveEquipmentStats(inv);
    // bases: 3 + 8 + 6 + 2 + 2 = 21; both bonuses fire (3-piece + 5-piece): +4 +10
    expect(stats.pDef).toBe(21 + 4 + 10);
    expect(stats.hp).toBe(20 + 60);
    expect(stats.moveSpeed).toBe(1);
  });

  test('activeSetBonuses for an unknown set returns no bonuses', () => {
    expect(activeSetBonuses('nope', ['anything'])).toEqual([]);
  });

  test('EQUIPMENT_SETS exports include leather_set', () => {
    expect(EQUIPMENT_SETS.leather_set).toBeDefined();
  });

  test('activeSetBonuses dedupes repeated template ids', () => {
    // Three identical pieces should NOT pass the 3-piece threshold.
    const bonuses = activeSetBonuses('leather_set', ['leather_helmet', 'leather_helmet', 'leather_helmet']);
    expect(bonuses).toEqual([]);
  });
});
