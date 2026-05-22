import { describe, expect, it } from 'vitest';
import { ITEMS } from '../packages/content/items';
import { VENDORS } from '../packages/content/vendors';
import { LOOT_TABLES } from '../packages/content/lootTables';

/**
 * Archwork #7 — pin the removal of five fake consumables.
 *
 * Each had a description tagged "(effect not yet implemented)" and
 * did nothing at runtime. Vendors stocked four of them, loot tables
 * dropped one of them six different ways. Removing them tightens
 * the content surface so the wiki / vendor UI / loot economy don't
 * promise effects the engine can't deliver.
 *
 * If a future PR genuinely implements one of these (the buff /
 * resistance engine), it should re-add the item with a real effect.
 * Until then, this test fails loudly if anyone re-adds them as a
 * placeholder.
 */

const REMOVED_FAKE_CONSUMABLES = [
  'elixir_of_strength',
  'fire_resistance_potion',
  'ice_resistance_potion',
  'ethereal_elixir',
  'temporal_draught',
] as const;

describe('archwork #7 — fake consumables stay removed', () => {
  for (const id of REMOVED_FAKE_CONSUMABLES) {
    it(`ITEMS["${id}"] does not exist`, () => {
      expect(ITEMS[id], `${id} must not be a placeholder item — implement or stay out`).toBeUndefined();
    });

    it(`no vendor stocks ${id}`, () => {
      for (const vendor of Object.values(VENDORS)) {
        for (const entry of vendor.stock) {
          expect(entry.itemId, `vendor ${vendor.id} re-added ${id}`).not.toBe(id);
        }
      }
    });

    it(`no loot table drops ${id}`, () => {
      for (const table of Object.values(LOOT_TABLES)) {
        for (const drop of table.drops) {
          expect(drop.itemId, `loot table ${table.id} re-added ${id}`).not.toBe(id);
        }
      }
    });
  }
});
