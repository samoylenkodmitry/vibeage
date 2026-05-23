import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS, findSetSlotConflicts, getSetMaxWearable } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';

/**
 * User: "some gears sets have invalid combinations of slots, like two
 * items at the same slot — we should validate all such things by
 * scripts. […] we generate wiki and engine from single source of
 * truth, that is how this should be done."
 *
 * `getSetMaxWearable` + `findSetSlotConflicts` are the single
 * source of truth. The wiki reads them for the "N of M" header,
 * the runtime checks them when computing bonus tiers, and these
 * tests assert no set ships with internal conflicts or
 * unreachable tiers.
 */
describe('equipment-set slot validity', () => {
  it('no set has two required pieces that compete for the same slot', () => {
    const offenders: string[] = [];
    for (const set of Object.values(EQUIPMENT_SETS)) {
      for (const [a, b] of findSetSlotConflicts(set)) {
        const nameA = ITEMS[a]?.name ?? a;
        const nameB = ITEMS[b]?.name ?? b;
        offenders.push(`${set.setId} (${set.name}): "${nameA}" + "${nameB}" both claim the same slot — can never be worn together`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every set bonus is reachable — no requiredCount exceeds wearable piece count', () => {
    const offenders: string[] = [];
    for (const set of Object.values(EQUIPMENT_SETS)) {
      const cap = getSetMaxWearable(set);
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
