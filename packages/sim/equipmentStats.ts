import { activeSetBonuses } from '../content/equipmentSets.js';
import type { ItemStatBlock } from '../content/equipmentTypes.js';
import { ITEMS, type Item } from '../content/items.js';
import type { CharacterInventory } from './characterInventory.js';

export type EquipmentStatBlock = Required<{
  [K in keyof ItemStatBlock]-?: number;
}>;

const ZERO: EquipmentStatBlock = {
  pAtk: 0,
  mAtk: 0,
  pDef: 0,
  mDef: 0,
  hp: 0,
  mp: 0,
  critRate: 0,
  attackSpeed: 0,
  moveSpeed: 0,
};

/**
 * Sum the per-item stat blocks of every currently-equipped item, then apply
 * the active set bonuses on top. Multi-slot items (full-body armor, two-hand
 * weapons) are still a single template so they only contribute once because
 * the equipment map keys by primary slot.
 */
export function deriveEquipmentStats(
  inventory: CharacterInventory,
  templates: Record<string, Item> = ITEMS,
): EquipmentStatBlock {
  const totals: EquipmentStatBlock = { ...ZERO };
  const equippedTemplateIds: string[] = [];
  const setIds = new Set<string>();

  for (const instanceId of Object.values(inventory.equipment)) {
    if (!instanceId) {
      continue;
    }
    const instance = inventory.items[instanceId];
    if (!instance) {
      continue;
    }
    const template = templates[instance.templateId];
    if (!template) {
      continue;
    }
    equippedTemplateIds.push(template.id);
    if (template.setId) {
      setIds.add(template.setId);
    }
    if (template.stats) {
      addStats(totals, template.stats);
    }
  }

  for (const setId of setIds) {
    for (const bonus of activeSetBonuses(setId, equippedTemplateIds)) {
      addStats(totals, bonus.statModifiers);
    }
  }

  return totals;
}

function addStats(target: EquipmentStatBlock, block: ItemStatBlock): void {
  target.pAtk += block.pAtk ?? 0;
  target.mAtk += block.mAtk ?? 0;
  target.pDef += block.pDef ?? 0;
  target.mDef += block.mDef ?? 0;
  target.hp += block.hp ?? 0;
  target.mp += block.mp ?? 0;
  target.critRate += block.critRate ?? 0;
  target.attackSpeed += block.attackSpeed ?? 0;
  target.moveSpeed += block.moveSpeed ?? 0;
}
