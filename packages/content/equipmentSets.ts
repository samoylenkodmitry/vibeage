import { BOSS_GEAR_SETS } from './bossGear.js';
import { ITEMS, type ItemId } from './items.js';
import { GRADE_SPECS, occupiedSlotsForSpec, type EquipSlot, type ItemGrade, type ItemStatBlock } from './equipmentTypes.js';
import { PROGRESSION_GEAR_SETS } from './progressionGear.js';
import { SPEC_GEAR_SETS } from './specGear.js';
import type { SpecializationId } from './specializations.js';

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
  /**
   * Specializations this set's bonus tiers were tuned for (§5
   * bullet 2). Declared data, not inferred: the armor-type
   * heuristic below can't tell a Cardinal's robe set from an
   * Arcanist's. The wiki Specs tab prefers this when present and
   * only falls back to the heuristic for untagged legacy sets.
   */
  intendedSpecs?: readonly SpecializationId[];
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
  ...PROGRESSION_GEAR_SETS,
  ...SPEC_GEAR_SETS,
};

/**
 * The one grade a set ships at. §5 bullet 1 makes single-grade an
 * invariant (`equipmentSetSameGrade.spec.ts`), so this is a lookup
 * rather than a vote — it returns the highest-ranked grade found so
 * a hypothetical regression degrades to "the tier you must reach to
 * finish the set" instead of throwing.
 *
 * Single source of truth for the wiki Sets tab chip, the Specs tab
 * gear path, and the validation specs.
 */
export function getSetGrade(set: EquipmentSet, items: Record<ItemId, { grade?: ItemGrade }>): ItemGrade {
  let top: ItemGrade = 'none';
  for (const id of [...set.requiredPieces, ...(set.optionalPieces ?? [])]) {
    const grade = items[id]?.grade ?? 'none';
    if (GRADE_SPECS[grade].rank > GRADE_SPECS[top].rank) top = grade;
  }
  return top;
}

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
/**
 * Hand-curated armor-type preference per class. Used by the
 * wiki Specs tab (§5 bullet 3) to surface "sets for this spec"
 * via the class's preferred armor + the set's chest piece. Two
 * armor types per class so e.g. a knight sees both heavy and
 * medium chests as eligible.
 */
type ArmorTypeHint = 'light' | 'medium' | 'heavy' | 'robe';

const CLASS_ARMOR_PREFERENCE: Record<string, readonly ArmorTypeHint[]> = {
  mage: ['light', 'robe'],
  healer: ['light', 'robe'],
  ranger: ['medium', 'light'],
  rogue: ['medium', 'light'],
  warrior: ['heavy', 'medium'],
  knight: ['heavy', 'medium'],
  paladin: ['heavy', 'medium'],
};

/**
 * Returns the set ids whose primary armor piece matches the
 * class's preferred armor types. Heuristic — items don't carry
 * explicit class restrictions, so we infer eligibility from the
 * armor type on any equipable piece in the set.
 *
 * If a future EquipmentSet declares an explicit `intendedClasses`
 * field, this helper should defer to that and skip the
 * heuristic.
 */
export function getSetsForClass(
  className: string,
  items: Record<ItemId, { equip?: { armorType?: ArmorTypeHint } }>,
): EquipmentSetId[] {
  const preferred = CLASS_ARMOR_PREFERENCE[className];
  if (!preferred) return [];
  const out: EquipmentSetId[] = [];
  for (const set of Object.values(EQUIPMENT_SETS)) {
    let matches = false;
    for (const id of set.requiredPieces) {
      const item = items[id];
      const armorType = item?.equip?.armorType;
      if (armorType && preferred.includes(armorType)) {
        matches = true;
        break;
      }
    }
    if (matches) out.push(set.setId);
  }
  return out;
}

/**
 * §5 bullet 3 — the gear path a player sees when they pick a
 * specialization. Prefers the declared `intendedSpecs` and only
 * falls back to the class armor-type heuristic for legacy sets
 * that predate the field, so a Cardinal no longer sees every robe
 * set in the game listed as "yours".
 *
 * Returns set ids sorted low → high grade so the wiki renders a
 * readable D → S progression without re-sorting.
 */
export function getSetsForSpec(
  specId: SpecializationId,
  baseClass: string,
  items: Record<ItemId, { grade?: ItemGrade; equip?: { armorType?: ArmorTypeHint } }>,
): EquipmentSetId[] {
  const tagged = Object.values(EQUIPMENT_SETS).filter((set) => set.intendedSpecs?.includes(specId));
  const untaggedForClass = getSetsForClass(baseClass, items)
    .map((id) => EQUIPMENT_SETS[id])
    .filter((set) => set && !set.intendedSpecs);
  return [...tagged, ...untaggedForClass]
    .sort((a, b) => GRADE_SPECS[getSetGrade(a, items)].rank - GRADE_SPECS[getSetGrade(b, items)].rank)
    .map((set) => set.setId);
}

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
