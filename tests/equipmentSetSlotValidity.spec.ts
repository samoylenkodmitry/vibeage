import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';
import { occupiedSlotsForSpec, type EquipSlot, type EquipSpec } from '../packages/content/equipmentTypes';

/**
 * User: "some gear sets have invalid combinations of slots, like two
 * items at the same slot — we should validate all such things by
 * scripts."
 *
 * For every equipment set, we compute the maximum number of pieces a
 * single character can wear simultaneously. A set bonus whose
 * `requiredCount` exceeds that maximum is unreachable — the player
 * will never trigger it because two of the required pieces compete
 * for the same body slot.
 *
 * Multi-slot allowed-slots (rings, earrings) are handled by trying
 * every assignment — two rings can coexist because they pick
 * different physical slots.
 */
function maxSimultaneous(pieceIds: readonly string[]): number {
  const specs: EquipSpec[] = [];
  for (const id of pieceIds) {
    const item = ITEMS[id];
    if (!item?.equip) continue;
    specs.push(item.equip);
  }
  let best = 0;
  function recurse(index: number, occupied: Set<EquipSlot>, count: number): void {
    if (index === specs.length) {
      if (count > best) best = count;
      return;
    }
    recurse(index + 1, occupied, count);
    const spec = specs[index];
    const candidateSlots = new Set<EquipSlot>();
    if (spec.bodyPart === 'fullBody') candidateSlots.add('CHEST');
    else if (spec.bodyPart === 'shield') candidateSlots.add('OFF_HAND');
    else if (spec.bodyPart === 'mainHand' || spec.bodyPart === 'offHand') {
      candidateSlots.add(spec.bodyPart === 'mainHand' ? 'MAIN_HAND' : 'OFF_HAND');
    } else {
      for (const s of spec.allowedSlots) candidateSlots.add(s);
    }
    for (const primary of candidateSlots) {
      const slots = occupiedSlotsForSpec(spec, primary);
      const clash = slots.some((s) => occupied.has(s));
      if (clash) continue;
      const next = new Set(occupied);
      for (const s of slots) next.add(s);
      recurse(index + 1, next, count + 1);
    }
  }
  recurse(0, new Set(), 0);
  return best;
}

describe('equipment-set slot validity', () => {
  it('every set bonus is reachable — no requiredCount exceeds wearable piece count', () => {
    const offenders: string[] = [];
    for (const set of Object.values(EQUIPMENT_SETS)) {
      const cap = maxSimultaneous(set.requiredPieces);
      for (const bonus of set.bonuses) {
        if (bonus.requiredCount > cap) {
          offenders.push(`${set.setId} (${set.name}): bonus requiredCount=${bonus.requiredCount} but only ${cap} pieces wearable simultaneously`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every set\'s required pieces have valid equip specs', () => {
    for (const set of Object.values(EQUIPMENT_SETS)) {
      for (const id of set.requiredPieces) {
        const item = ITEMS[id];
        expect(item, `set ${set.setId} → ${id} missing from ITEMS`).toBeDefined();
        expect(item.equip, `set ${set.setId} piece ${id} has no equip spec`).toBeDefined();
      }
    }
  });
});
