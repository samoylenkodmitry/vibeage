import { describe, expect, it } from 'vitest';
import { indexInventoryBySlot } from '../apps/client/src/hud/InventoryPanel';
import type { InventorySlot } from '../packages/protocol/messages';

/**
 * §52 #11 — the InventoryPanel renders items by their real bag slot
 * index (the new `slotIndex` field on `InventorySlot`). Pre-§52 it
 * indexed by array position, which silently broke when the bag was
 * sparse — e.g. after equipping the item at slot 1, the wire array
 * shrank to length 2 and the slot-2 item rendered at UI cell 1.
 */

describe('indexInventoryBySlot', () => {
  it('positions items by their explicit slotIndex when present', () => {
    const wire: InventorySlot[] = [
      { itemId: 'gold_coin', quantity: 5, slotIndex: 0 },
      { itemId: 'health_potion', quantity: 3, slotIndex: 2 },
      { itemId: 'flame_blade', quantity: 1, slotIndex: 5 },
    ];
    const byIndex = indexInventoryBySlot(wire);
    expect(byIndex[0]?.itemId).toBe('gold_coin');
    expect(byIndex[1]).toBeUndefined();
    expect(byIndex[2]?.itemId).toBe('health_potion');
    expect(byIndex[3]).toBeUndefined();
    expect(byIndex[4]).toBeUndefined();
    expect(byIndex[5]?.itemId).toBe('flame_blade');
  });

  it('falls back to array position when slotIndex is omitted (legacy wire from older servers)', () => {
    const wire: InventorySlot[] = [
      { itemId: 'gold_coin', quantity: 5 },
      { itemId: 'health_potion', quantity: 3 },
    ];
    const byIndex = indexInventoryBySlot(wire);
    expect(byIndex[0]?.itemId).toBe('gold_coin');
    expect(byIndex[1]?.itemId).toBe('health_potion');
  });

  it('supports a mixed payload (some slots with index, some without — last-write wins per index)', () => {
    // Defensive: if a future server build emits a partial slotIndex,
    // the explicit value still wins for the slots that carry it.
    const wire: InventorySlot[] = [
      { itemId: 'gold_coin', quantity: 5 }, // array index 0 → slot 0
      { itemId: 'health_potion', quantity: 3, slotIndex: 4 },
    ];
    const byIndex = indexInventoryBySlot(wire);
    expect(byIndex[0]?.itemId).toBe('gold_coin');
    expect(byIndex[4]?.itemId).toBe('health_potion');
  });

  it('skips empty / nullish slots without crashing', () => {
    const wire = [
      { itemId: 'gold_coin', quantity: 5, slotIndex: 0 },
      null,
      undefined,
      { itemId: 'flame_blade', quantity: 1, slotIndex: 3 },
    ] as unknown as InventorySlot[];
    const byIndex = indexInventoryBySlot(wire);
    expect(byIndex[0]?.itemId).toBe('gold_coin');
    expect(byIndex[3]?.itemId).toBe('flame_blade');
    expect(byIndex[1]).toBeUndefined();
    expect(byIndex[2]).toBeUndefined();
  });
});
