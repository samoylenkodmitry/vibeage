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

  it('every boss-gear equipment piece points back at a registered set', () => {
    for (const item of Object.values(BOSS_GEAR_ITEMS)) {
      if (item.type !== 'weapon' && item.type !== 'armor') continue;
      expect(item.setId, `${item.id} has no setId`).toBeTruthy();
      expect(EQUIPMENT_SETS[item.setId!], `set ${item.setId} not registered`).toBeDefined();
    }
  });

  it('activeSetBonuses returns stacked tiers as pieces accumulate', () => {
    const set = BOSS_GEAR_SETS.elementborn;
    expect(activeSetBonuses(set.setId, [set.requiredPieces[0]]).length).toBe(0);
    expect(activeSetBonuses(set.setId, set.requiredPieces.slice(0, 2)).length).toBe(1);
    expect(activeSetBonuses(set.setId, set.requiredPieces.slice(0, 3)).length).toBe(2);
    expect(activeSetBonuses(set.setId, set.requiredPieces.slice(0, 4)).length).toBe(3);
  });
});
