import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';

/**
 * Bidirectional integrity check between `item.setId` and
 * `EQUIPMENT_SETS[set].requiredPieces`. Either both sides agree, or
 * the item has no `setId` and no set claims it.
 *
 * Why this exists: when we removed `slab_warhammer` and
 * `refraction_staff` from their sets' `requiredPieces` (because
 * they conflicted on MAIN_HAND with the main weapon), the items
 * themselves still declared the original `setId`. Wiki showed
 * "Part of: Wildlands Hunter" on the warhammer page while the set
 * page listed only 2 of the 3 items. Same data declared twice =
 * drift. This test makes that drift impossible.
 */
describe('item ↔ set backreference integrity', () => {
  it('every item.setId resolves to a set that lists the item', () => {
    const offenders: string[] = [];
    for (const item of Object.values(ITEMS)) {
      if (!item.setId) continue;
      const set = EQUIPMENT_SETS[item.setId];
      if (!set) {
        offenders.push(`${item.id} (${item.name}) declares setId="${item.setId}" but set is not registered`);
        continue;
      }
      if (!set.requiredPieces.includes(item.id) && !(set.optionalPieces ?? []).includes(item.id)) {
        offenders.push(`${item.id} (${item.name}) declares setId="${item.setId}" but ${set.setId} doesn't list it`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every requiredPieces/optionalPieces entry has matching item.setId', () => {
    const offenders: string[] = [];
    for (const set of Object.values(EQUIPMENT_SETS)) {
      const all = [...set.requiredPieces, ...(set.optionalPieces ?? [])];
      for (const id of all) {
        const item = ITEMS[id];
        if (!item) {
          offenders.push(`${set.setId} lists "${id}" but ITEMS has no such id`);
          continue;
        }
        if (item.setId !== set.setId) {
          offenders.push(`${set.setId} lists "${id}" but ${id}.setId is "${item.setId ?? '<undefined>'}"`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
