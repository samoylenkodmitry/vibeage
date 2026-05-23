import { BOSS_GEAR_SETS } from './bossGear.js';
import { ITEMS, type ItemId } from './items.js';
import { occupiedSlotsForSpec, type EquipSlot, type ItemStatBlock } from './equipmentTypes.js';

export type EquipmentSetId = string;

export type SetBonus = {
  requiredCount: number;
  statModifiers: ItemStatBlock;
};

export type EquipmentSet = {
  setId: EquipmentSetId;
  name: string;
  requiredPieces: readonly ItemId[];
  optionalPieces?: readonly ItemId[];
  bonuses: readonly SetBonus[];
};

export const EQUIPMENT_SETS: Record<EquipmentSetId, EquipmentSet> = {
  leather_set: {
    setId: 'leather_set',
    name: 'Leather Set',
    requiredPieces: [
      'leather_helmet',
      'leather_tunic',
      'leather_pants',
      'leather_gloves',
      'leather_boots',
    ],
    bonuses: [
      { requiredCount: 3, statModifiers: { pDef: 4, hp: 20 } },
      { requiredCount: 5, statModifiers: { pDef: 10, hp: 60, moveSpeed: 1 } },
    ],
  },
  ...BOSS_GEAR_SETS,
};

/**
 * Single source of truth for "how many pieces of this set can a
 * character wear at once" — brute-forces every slot assignment for
 * the `requiredPieces` (ring/earring multi-slots included) and
 * returns the largest non-conflicting subset.
 *
 * Used by the runtime (set bonus tier ceiling), the wiki (header
 * "N of M wearable"), and validation (`equipmentSetSlotValidity`
 * spec asserts no same-slot pair sneaks in).
 */
export function getSetMaxWearable(set: EquipmentSet): number {
  const specs = set.requiredPieces
    .map((id) => ITEMS[id]?.equip)
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));
  let best = 0;
  function recurse(index: number, occupied: Set<EquipSlot>, count: number): void {
    if (index === specs.length) { if (count > best) best = count; return; }
    recurse(index + 1, occupied, count);
    const spec = specs[index];
    const candidates = new Set<EquipSlot>();
    if (spec.bodyPart === 'fullBody') candidates.add('CHEST');
    else if (spec.bodyPart === 'shield') candidates.add('OFF_HAND');
    else if (spec.bodyPart === 'mainHand' || spec.bodyPart === 'offHand') {
      candidates.add(spec.bodyPart === 'mainHand' ? 'MAIN_HAND' : 'OFF_HAND');
    } else for (const s of spec.allowedSlots) candidates.add(s);
    for (const primary of candidates) {
      const slots = occupiedSlotsForSpec(spec, primary);
      if (slots.some((s) => occupied.has(s))) continue;
      const next = new Set(occupied);
      for (const s of slots) next.add(s);
      recurse(index + 1, next, count + 1);
    }
  }
  recurse(0, new Set(), 0);
  return best;
}

/**
 * Pairs of pieces in `requiredPieces` that can never coexist on the
 * same character (both pieces want a slot the other one also wants,
 * in every possible allocation). A set with any such pair has data
 * inconsistency — the "set" can't actually be completed.
 *
 * Source of truth for both validation + wiki "N of M" header.
 */
export function findSetSlotConflicts(set: EquipmentSet): Array<readonly [ItemId, ItemId]> {
  const out: Array<readonly [ItemId, ItemId]> = [];
  const ids = set.requiredPieces;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const sub: EquipmentSet = { ...set, requiredPieces: [ids[i], ids[j]] };
      if (getSetMaxWearable(sub) < 2) out.push([ids[i], ids[j]] as const);
    }
  }
  return out;
}

/**
 * Returns every bonus tier whose `requiredCount` is met by the unique pieces
 * the character has equipped from this set. Tiers are additive — a 5-piece
 * leather wearer gets both the 3-piece and 5-piece bonuses.
 *
 * Duplicate template ids are collapsed before counting so a (currently
 * impossible) double-equip wouldn't inflate the count.
 */
export function activeSetBonuses(
  setId: EquipmentSetId,
  equippedTemplateIds: readonly ItemId[],
): SetBonus[] {
  const set = EQUIPMENT_SETS[setId];
  if (!set) {
    return [];
  }
  const uniqueEquipped = new Set<ItemId>();
  for (const templateId of equippedTemplateIds) {
    if (set.requiredPieces.includes(templateId) || set.optionalPieces?.includes(templateId)) {
      uniqueEquipped.add(templateId);
    }
  }
  return set.bonuses.filter((bonus) => uniqueEquipped.size >= bonus.requiredCount);
}
