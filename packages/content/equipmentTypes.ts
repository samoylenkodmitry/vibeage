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

type BodyPart =
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

type HandUsage =
  | 'none'
  | 'oneHand'
  | 'twoHand'
  | 'dualWield'
  | 'bow'
  | 'fist'
  | 'shield';

type WeaponType =
  | 'sword'
  | 'dagger'
  | 'mace'
  | 'staff'
  | 'bow'
  | 'spear'
  | 'fist'
  | 'orb';

type ArmorType = 'light' | 'medium' | 'heavy' | 'robe';

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

/**
 * Single source of truth for item grades. Engine reads `minLevel` for
 * the equip gate; wiki + tooltips read `label`, `color`, and
 * `description` for the player-facing UI. Everywhere that touches
 * grades — `getEffectiveMinLevel`, the tooltip grade tag, the wiki
 * grade chip, the wiki Grades tab — pulls from this record so the
 * displayed tier and the actual gate can't drift apart.
 *
 * Grades mirror the L2-style D/C/B/A/S progression in a 1–80 level
 * band. `none` is the tier for unequippable / non-gear items
 * (consumables, materials, currency).
 */
export type GradeSpec = {
  id: ItemGrade;
  /** Display label rendered next to the item name. `—` for `none`. */
  label: string;
  /** Display order on the wiki Grades tab. Higher tier = larger. */
  rank: number;
  /** CSS color token used for tooltip / wiki chips. */
  color: string;
  /** Minimum player level required to equip an item at this grade. */
  minLevel: number;
  /** One-line player-facing description shown in tooltips + wiki. */
  description: string;
};

export const GRADE_SPECS: Record<ItemGrade, GradeSpec> = {
  none: {
    id: 'none', label: '—', rank: 0, color: '#94a3b8', minLevel: 1,
    description: 'Common items with no tier requirement (consumables, materials, currency).',
  },
  d: {
    id: 'd', label: 'D', rank: 1, color: '#a3a3a3', minLevel: 8,
    description: 'Starter-tier gear. Available from Lv 8.',
  },
  c: {
    id: 'c', label: 'C', rank: 2, color: '#6ee7b7', minLevel: 20,
    description: 'Mid-tier gear crafted from common materials. Available from Lv 20.',
  },
  b: {
    id: 'b', label: 'B', rank: 3, color: '#93c5fd', minLevel: 36,
    description: 'Refined gear requiring rare trophies. Available from Lv 36.',
  },
  a: {
    id: 'a', label: 'A', rank: 4, color: '#c4b5fd', minLevel: 52,
    description: 'Elite gear forged from boss-tier materials. Available from Lv 52.',
  },
  s: {
    id: 's', label: 'S', rank: 5, color: '#fcd34d', minLevel: 68,
    description: 'Apex gear. Available from Lv 68.',
  },
};

/**
 * Derived from `GRADE_SPECS` so the engine and the UI can never
 * disagree on the minimum level for a grade.
 */
export const GRADE_MIN_LEVEL: Record<ItemGrade, number> = {
  none: GRADE_SPECS.none.minLevel,
  d: GRADE_SPECS.d.minLevel,
  c: GRADE_SPECS.c.minLevel,
  b: GRADE_SPECS.b.minLevel,
  a: GRADE_SPECS.a.minLevel,
  s: GRADE_SPECS.s.minLevel,
};

/** Effective level floor for an item, combining grade + per-item override. */
export function getEffectiveMinLevel(grade: ItemGrade, perItemMinLevel?: number): number {
  return Math.max(GRADE_SPECS[grade]?.minLevel ?? 1, perItemMinLevel ?? 0);
}

/** Convenience accessors that read GRADE_SPECS for the UI. */
export function getGradeSpec(grade: ItemGrade): GradeSpec {
  return GRADE_SPECS[grade] ?? GRADE_SPECS.none;
}
export function getGradeLabel(grade: ItemGrade): string {
  return GRADE_SPECS[grade]?.label ?? '—';
}
export function getGradeColor(grade: ItemGrade): string {
  return GRADE_SPECS[grade]?.color ?? GRADE_SPECS.none.color;
}
/** Grades sorted low → high tier for wiki listing. */
export function listGradeSpecs(): GradeSpec[] {
  return Object.values(GRADE_SPECS).sort((a, b) => a.rank - b.rank);
}

export type ItemFlag = 'bound' | 'questItem' | 'uniqueEquipped' | 'destroyOnLogout';

type EquipRequirements = {
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
  if (requestedSlot && spec.allowedSlots.includes(requestedSlot)) {
    return [requestedSlot];
  }
  return spec.allowedSlots.length > 0 ? [spec.allowedSlots[0]] : [];
}
