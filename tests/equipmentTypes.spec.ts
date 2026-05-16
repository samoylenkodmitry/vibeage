import { describe, expect, test } from 'vitest';
import {
  EQUIP_SLOTS,
  occupiedSlotsForSpec,
  type EquipSpec,
} from '../packages/content/equipmentTypes';
import { ITEMS, getItemKind, getItemGrade, getItemWeight } from '../packages/content/items';

describe('equipment types', () => {
  test('EQUIP_SLOTS lists the 15 MVP slots in stable order', () => {
    expect(EQUIP_SLOTS).toEqual([
      'HEAD', 'CHEST', 'LEGS', 'GLOVES', 'BOOTS',
      'MAIN_HAND', 'OFF_HAND',
      'NECK', 'EAR_LEFT', 'EAR_RIGHT', 'RING_LEFT', 'RING_RIGHT',
      'BELT', 'CLOAK', 'SHIRT',
    ]);
  });

  test('one-handed weapon occupies only the main hand', () => {
    const spec: EquipSpec = { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand' };
    expect(occupiedSlotsForSpec(spec)).toEqual(['MAIN_HAND']);
  });

  test('two-handed weapon and bow take both main hand and off hand', () => {
    const twoHand: EquipSpec = { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'twoHand' };
    const bow: EquipSpec = { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'bow' };
    const dual: EquipSpec = { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'dualWield' };
    expect(occupiedSlotsForSpec(twoHand)).toEqual(['MAIN_HAND', 'OFF_HAND']);
    expect(occupiedSlotsForSpec(bow)).toEqual(['MAIN_HAND', 'OFF_HAND']);
    expect(occupiedSlotsForSpec(dual)).toEqual(['MAIN_HAND', 'OFF_HAND']);
  });

  test('shield takes the off hand only', () => {
    const shield: EquipSpec = { bodyPart: 'shield', allowedSlots: ['OFF_HAND'], handUsage: 'shield' };
    expect(occupiedSlotsForSpec(shield)).toEqual(['OFF_HAND']);
  });

  test('full-body armor blocks both chest and legs', () => {
    const fullBody: EquipSpec = { bodyPart: 'fullBody', allowedSlots: ['CHEST', 'LEGS'] };
    expect(occupiedSlotsForSpec(fullBody)).toEqual(['CHEST', 'LEGS']);
  });

  test('ring with no preference falls back to the first allowed slot', () => {
    const ring: EquipSpec = { bodyPart: 'ring', allowedSlots: ['RING_LEFT', 'RING_RIGHT'] };
    expect(occupiedSlotsForSpec(ring)).toEqual(['RING_LEFT']);
  });

  test('ring honours a requested slot when allowed', () => {
    const ring: EquipSpec = { bodyPart: 'ring', allowedSlots: ['RING_LEFT', 'RING_RIGHT'] };
    expect(occupiedSlotsForSpec(ring, 'RING_RIGHT')).toEqual(['RING_RIGHT']);
  });
});

describe('item template metadata', () => {
  test('annotated weapons carry kind, grade, weight, and equip', () => {
    const worn = ITEMS.worn_sword;
    expect(getItemKind(worn)).toBe('weapon');
    expect(getItemGrade(worn)).toBe('none');
    expect(getItemWeight(worn)).toBeGreaterThan(0);
    expect(worn.equip?.handUsage).toBe('oneHand');
  });

  test('crystal_staff is two-handed and the helper picks both hand slots', () => {
    const staff = ITEMS.crystal_staff;
    expect(staff.equip?.handUsage).toBe('twoHand');
    expect(occupiedSlotsForSpec(staff.equip!)).toEqual(['MAIN_HAND', 'OFF_HAND']);
  });

  test('plate_cuirass is fullBody and occupies CHEST + LEGS', () => {
    const plate = ITEMS.plate_cuirass;
    expect(plate.equip?.bodyPart).toBe('fullBody');
    expect(occupiedSlotsForSpec(plate.equip!)).toEqual(['CHEST', 'LEGS']);
  });

  test('jewelry templates expose ring and earring body parts', () => {
    expect(ITEMS.bone_necklace.equip?.bodyPart).toBe('neck');
    expect(ITEMS.bone_earring.equip?.bodyPart).toBe('earring');
    expect(ITEMS.bone_ring.equip?.bodyPart).toBe('ring');
  });

  test('legacy non-annotated items still resolve to a sensible kind', () => {
    expect(getItemKind(ITEMS.health_potion)).toBe('consumable');
    expect(getItemKind(ITEMS.gold_coin)).toBe('currency');
    expect(getItemGrade(ITEMS.health_potion)).toBe('none');
    expect(getItemWeight(ITEMS.health_potion)).toBe(0);
  });
});
