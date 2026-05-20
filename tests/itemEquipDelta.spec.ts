import { describe, expect, it } from 'vitest';
import { computeDelta } from '../apps/client/src/hud/ItemTooltip';
import { resolveCompareStats } from '../apps/client/src/hud/InventoryPanel';
import { ITEMS } from '../packages/content/items';

// §49/M2 — equip stat delta. Tooltip compares the hovered item's
// stats to the currently-equipped item in the same body slot and
// surfaces a signed delta so new players don't have to compute
// "is this an upgrade?" in their head.

describe('computeDelta', () => {
  it('returns null when nothing is equipped to compare against', () => {
    expect(computeDelta('pAtk', { pAtk: 5 }, undefined)).toBeNull();
  });

  it('returns the signed difference when equipped item exists', () => {
    expect(computeDelta('pAtk', { pAtk: 8 }, { pAtk: 5 })).toBe(3);
    expect(computeDelta('pAtk', { pAtk: 5 }, { pAtk: 8 })).toBe(-3);
    expect(computeDelta('pAtk', { pAtk: 5 }, { pAtk: 5 })).toBe(0);
  });

  it('treats missing stats as 0 on either side', () => {
    expect(computeDelta('mAtk', {}, { mAtk: 4 })).toBe(-4);
    expect(computeDelta('mAtk', { mAtk: 7 }, {})).toBe(7);
    expect(computeDelta('mAtk', {}, {})).toBe(0);
  });
});

describe('resolveCompareStats', () => {
  it('returns undefined when no equipment passed', () => {
    expect(resolveCompareStats('worn_sword', undefined)).toBeUndefined();
  });

  it('returns undefined when the hovered item is not equippable', () => {
    expect(resolveCompareStats('health_potion', { MAIN_HAND: 'worn_sword' })).toBeUndefined();
  });

  it('returns undefined when nothing is equipped in the matching slot', () => {
    expect(resolveCompareStats('worn_sword', {})).toBeUndefined();
  });

  it('returns the equipped item stats when the slot matches', () => {
    const wornSword = ITEMS.worn_sword;
    // worn_sword uses bodyPart 'mainHand' (camelCase) which
    // `occupiedSlotsForSpec` resolves to the EquipSlot 'MAIN_HAND'.
    const equipped = { MAIN_HAND: 'worn_sword' };
    const stats = resolveCompareStats('worn_sword', equipped);
    expect(stats).toEqual(wornSword.stats);
  });

  it('returns undefined when the equipped item template is unknown', () => {
    expect(resolveCompareStats('worn_sword', { MAIN_HAND: 'not_a_real_item' })).toBeUndefined();
  });
});
