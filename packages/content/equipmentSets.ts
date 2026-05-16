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
};

/**
 * Returns the bonus tiers that fire given which templates from a set are
 * currently equipped. Picks the highest tier whose requiredCount is met for
 * a deterministic, additive result.
 */
export function activeSetBonuses(
  setId: EquipmentSetId,
  equippedTemplateIds: readonly ItemId[],
): SetBonus[] {
  const set = EQUIPMENT_SETS[setId];
  if (!set) {
    return [];
  }
  const equippedFromSet = equippedTemplateIds.filter(
    (templateId) =>
      set.requiredPieces.includes(templateId)
      || set.optionalPieces?.includes(templateId),
  );
  return set.bonuses.filter((bonus) => equippedFromSet.length >= bonus.requiredCount);
}
