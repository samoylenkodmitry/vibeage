import type { CharacterClass } from './classes.js';

export type EquipSlot =
  | 'HEAD'
  | 'CHEST'
  | 'LEGS'
  | 'GLOVES'
  | 'BOOTS'
  | 'MAIN_HAND'
  | 'OFF_HAND'
  | 'NECK'
  | 'EAR_LEFT'
  | 'EAR_RIGHT'
  | 'RING_LEFT'
  | 'RING_RIGHT'
  | 'BELT'
  | 'CLOAK'
  | 'SHIRT';

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'HEAD', 'CHEST', 'LEGS', 'GLOVES', 'BOOTS',
  'MAIN_HAND', 'OFF_HAND',
  'NECK', 'EAR_LEFT', 'EAR_RIGHT', 'RING_LEFT', 'RING_RIGHT',
  'BELT', 'CLOAK', 'SHIRT',
] as const;

export type BodyPart =
  | 'head'
  | 'chest'
  | 'legs'
  | 'fullBody'
  | 'gloves'
  | 'boots'
  | 'mainHand'
  | 'offHand'
  | 'shield'
  | 'neck'
  | 'earring'
  | 'ring'
  | 'belt'
  | 'cloak'
  | 'shirt';

export type HandUsage =
  | 'none'
  | 'oneHand'
  | 'twoHand'
  | 'dualWield'
  | 'bow'
  | 'fist'
  | 'shield';

export type WeaponType =
  | 'sword'
  | 'dagger'
  | 'mace'
  | 'staff'
  | 'bow'
  | 'spear'
  | 'fist'
  | 'orb';

export type ArmorType = 'light' | 'medium' | 'heavy' | 'robe';

export type ItemKind =
  | 'weapon'
  | 'shield'
  | 'armor'
  | 'jewelry'
  | 'consumable'
  | 'material'
  | 'currency'
  | 'quest'
  | 'etc';

export type ItemGrade = 'none' | 'd' | 'c' | 'b' | 'a' | 's';

export type ItemFlag = 'bound' | 'questItem' | 'uniqueEquipped' | 'destroyOnLogout';

export type EquipRequirements = {
  minLevel?: number;
  classes?: readonly CharacterClass[];
  grade?: ItemGrade;
};

export type EquipSpec = {
  bodyPart: BodyPart;
  allowedSlots: readonly EquipSlot[];
  weaponType?: WeaponType;
  armorType?: ArmorType;
  handUsage?: HandUsage;
  requirements?: EquipRequirements;
};

export type ItemStatBlock = {
  pAtk?: number;
  mAtk?: number;
  pDef?: number;
  mDef?: number;
  hp?: number;
  mp?: number;
  critRate?: number;
  attackSpeed?: number;
  moveSpeed?: number;
};

export const RING_SLOTS: readonly EquipSlot[] = ['RING_LEFT', 'RING_RIGHT'];
export const EARRING_SLOTS: readonly EquipSlot[] = ['EAR_LEFT', 'EAR_RIGHT'];

/**
 * Returns the equipment slots a given EquipSpec occupies when worn.
 * Multi-slot items (full-body armor, two-handed weapons, bows, dual wield) return more than one slot.
 * The first slot in the returned array is the **primary** slot used as the resolved equip target.
 */
export function occupiedSlotsForSpec(spec: EquipSpec, requestedSlot?: EquipSlot): readonly EquipSlot[] {
  if (spec.bodyPart === 'fullBody') {
    return ['CHEST', 'LEGS'];
  }
  if (spec.bodyPart === 'mainHand' || spec.bodyPart === 'offHand') {
    if (spec.handUsage === 'twoHand' || spec.handUsage === 'bow' || spec.handUsage === 'dualWield') {
      return ['MAIN_HAND', 'OFF_HAND'];
    }
    if (spec.bodyPart === 'mainHand') {
      return ['MAIN_HAND'];
    }
    return ['OFF_HAND'];
  }
  if (spec.bodyPart === 'shield') {
    return ['OFF_HAND'];
  }
  if (spec.bodyPart === 'ring' || spec.bodyPart === 'earring') {
    if (requestedSlot && spec.allowedSlots.includes(requestedSlot)) {
      return [requestedSlot];
    }
    return [spec.allowedSlots[0]];
  }
  if (requestedSlot && spec.allowedSlots.includes(requestedSlot)) {
    return [requestedSlot];
  }
  return [spec.allowedSlots[0]];
}
