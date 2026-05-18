import { BOSS_GEAR_SETS } from './bossGear.js';
import type { ItemId } from './items.js';
import type { ItemStatBlock } from './equipmentTypes.js';

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
