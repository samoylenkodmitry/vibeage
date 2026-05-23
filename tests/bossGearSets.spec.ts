import { describe, expect, it } from 'vitest';
import { BOSS_GEAR_ITEMS, BOSS_GEAR_SETS } from '../packages/content/bossGear';
import { EQUIPMENT_SETS, activeSetBonuses } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';

describe('boss-gear sets', () => {
  it('every boss-gear set is registered in EQUIPMENT_SETS and points only at real items', () => {
    for (const set of Object.values(BOSS_GEAR_SETS)) {
      expect(EQUIPMENT_SETS[set.setId]).toBe(set);
      for (const id of set.requiredPieces) {
        expect(ITEMS[id], `set ${set.setId} → ${id} missing from ITEMS`).toBeDefined();
        expect(ITEMS[id].setId, `${id} should declare setId = ${set.setId}`).toBe(set.setId);
      }
    }
  });

  it('every boss-gear equipment piece with a setId is actually in that set\'s requiredPieces (no dangling backref)', () => {
    // Some boss-gear pieces are independent rewards (e.g. the two-
    // hand weapons that conflict with their set's main weapon on
    // MAIN_HAND). Those pieces simply have no setId. The integrity
    // rule is bidirectional: if a piece DOES declare a setId, that
    // set must exist AND list the piece. The reverse check
    // (\"every requiredPieces entry has matching setId\") lives in
    // the cross-content `itemSetBackref.spec.ts` test that scans
    // all of ITEMS (not just boss gear).
    for (const item of Object.values(BOSS_GEAR_ITEMS)) {
      if (!item.setId) continue;
      const set = EQUIPMENT_SETS[item.setId];
      expect(set, `${item.id}.setId="${item.setId}" but set is not registered`).toBeDefined();
      expect(
        set!.requiredPieces.includes(item.id),
        `${item.id} declares setId="${item.setId}" but the set's requiredPieces don't include it`,
      ).toBe(true);
    }
  });

  it('activeSetBonuses returns stacked tiers as pieces accumulate', () => {
    // Elementborn is now exactly 3 pieces (edge, plate, helm).
    // The two-handed `refraction_staff` was removed from
    // `requiredPieces` because it competed with `embers_edge` for
    // MAIN_HAND, leaving the set internally inconsistent — see
    // equipmentSetSlotValidity.spec.ts for the rule.
    const set = BOSS_GEAR_SETS.elementborn;
    expect(set.requiredPieces.length).toBe(3);
    expect(activeSetBonuses(set.setId, [set.requiredPieces[0]]).length).toBe(0);
    expect(activeSetBonuses(set.setId, set.requiredPieces.slice(0, 2)).length).toBe(1);
    expect(activeSetBonuses(set.setId, set.requiredPieces).length).toBe(2);
  });
});
