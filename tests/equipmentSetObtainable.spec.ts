import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS, getSetGrade } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';
import { GRADE_SPECS } from '../packages/content/equipmentTypes';
import { getItemSources } from '../packages/content/obtainability';
import { GAME_ZONES } from '../packages/content/zones';

/**
 * Roadmap §5 bullet 2 — "an unobtainable set is worse than no set".
 *
 * `content:audit:check` already fails on a *hanging* item (zero
 * sources anywhere). This spec adds the two set-specific rules that
 * audit can't see:
 *
 *   1. every required piece of every set has at least one source —
 *      a set where three of four pieces drop and the fourth exists
 *      only in the item table is a set the player can never finish;
 *   2. when a piece drops from a world loot table, that table's
 *      zone band must reach the grade's equip level. A D-grade
 *      (Lv 8+) piece dropping only in a Lv 1–3 meadow is gear the
 *      player picks up and cannot wear for five levels; a C-grade
 *      (Lv 20+) piece dropping only off a Lv 9 boss is the same bug
 *      in the other direction — the drop is under-levelled for the
 *      tier it claims.
 *
 * Vendor / quest / recipe sources carry no level band of their own
 * (the vendor's level gate lives in the quest chain that unlocks
 * it), so rule 2 only applies to loot-table sources.
 */

/** lootTableId → the highest character level that table's spawns reach. */
function buildLootTableCeiling(): Map<string, number> {
  const ceiling = new Map<string, number>();
  const raise = (tableId: string, level: number) => {
    ceiling.set(tableId, Math.max(ceiling.get(tableId) ?? 0, level));
  };
  for (const zone of GAME_ZONES) {
    for (const mob of zone.mobs) raise(`${mob.type}_loot`, zone.maxLevel);
    const boss = zone.miniBoss;
    if (boss) raise(boss.lootTableId, zone.maxLevel + (boss.levelBonus ?? 0));
  }
  return ceiling;
}

const LOOT_CEILING = buildLootTableCeiling();

describe('equipment sets are obtainable at their own tier', () => {
  it('every required piece of every set has at least one source', () => {
    const offenders: string[] = [];
    for (const set of Object.values(EQUIPMENT_SETS)) {
      for (const id of set.requiredPieces) {
        if (getItemSources(id).length === 0) {
          offenders.push(`${set.setId} (${set.name}): "${id}" has no vendor / loot / recipe / quest source — the set can never be completed`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('loot-sourced pieces drop in a band that can actually equip them', () => {
    const offenders: string[] = [];
    for (const set of Object.values(EQUIPMENT_SETS)) {
      const grade = getSetGrade(set, ITEMS);
      const minLevel = GRADE_SPECS[grade].minLevel;
      for (const id of set.requiredPieces) {
        const tables = getItemSources(id)
          .filter((s) => s.kind === 'loot')
          .map((s) => s.tableId);
        if (tables.length === 0) continue; // vendor / quest / recipe only
        const best = Math.max(...tables.map((t) => LOOT_CEILING.get(t) ?? 0));
        if (best < minLevel) {
          offenders.push(`${set.setId} → ${id}: grade ${grade.toUpperCase()} needs Lv ${minLevel} to equip but its best drop tops out at Lv ${best} (${tables.join(', ')})`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
