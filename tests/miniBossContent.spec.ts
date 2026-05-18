import { describe, expect, it } from 'vitest';
import { ITEMS } from '../packages/content/items';
import { LOOT_TABLES } from '../packages/content/lootTables';
import {
  getMiniBossById,
  getMiniBossByTrophyItem,
  getMiniBossesByMobType,
  listMiniBosses,
  MINI_BOSSES,
} from '../packages/content/miniBosses';
import { GAME_ZONES } from '../packages/content/zones';

describe('mini-boss content registry', () => {
  it('exposes every boss with the four content links resolvable', () => {
    const bosses = listMiniBosses();
    expect(bosses.length).toBeGreaterThan(0);
    for (const boss of bosses) {
      expect(ITEMS[boss.trophyItemId], `trophy ${boss.trophyItemId} missing from ITEMS`).toBeTruthy();
      expect(LOOT_TABLES[boss.lootTableId], `loot table ${boss.lootTableId} missing`).toBeTruthy();
      const drops = LOOT_TABLES[boss.lootTableId].drops.map((d) => d.itemId);
      expect(drops, `loot table ${boss.lootTableId} must drop ${boss.trophyItemId}`).toContain(boss.trophyItemId);
    }
  });

  it('reverse lookups resolve back to the same boss', () => {
    for (const boss of listMiniBosses()) {
      expect(getMiniBossById(boss.id)).toBe(boss);
      expect(getMiniBossByTrophyItem(boss.trophyItemId)).toBe(boss);
      expect(getMiniBossesByMobType(boss.mobType)).toContain(boss);
    }
    expect(getMiniBossById('not_a_boss')).toBeNull();
    expect(getMiniBossByTrophyItem('not_a_trophy')).toBeNull();
    expect(getMiniBossesByMobType('not_a_mob')).toEqual([]);
  });

  it('every zone miniBoss has an id that matches a registry entry + matching loot table', () => {
    const zonesWithBosses = GAME_ZONES.filter((z) => z.miniBoss);
    expect(zonesWithBosses.length).toBeGreaterThan(0);
    for (const zone of zonesWithBosses) {
      const mb = zone.miniBoss!;
      expect(mb.id, `${zone.id} miniBoss missing id`).toBeTruthy();
      const spec = MINI_BOSSES[mb.id!];
      expect(spec, `zone ${zone.id} miniBoss id "${mb.id}" not in registry`).toBeTruthy();
      expect(mb.lootTableId).toBe(spec.lootTableId);
      expect(mb.name).toBe(spec.name);
    }
  });

  it('every mini-boss has a specific in-zone position (so the map pin points at the encounter)', async () => {
    const { getMobZones } = await import('../packages/content/mobLocations');
    for (const zone of GAME_ZONES) {
      const mb = zone.miniBoss;
      if (!mb) continue;
      expect(mb.position, `zone ${zone.id} miniBoss "${mb.name}" needs a position`).toBeDefined();
      const dx = mb.position!.x - zone.position.x;
      const dz = mb.position!.z - zone.position.z;
      const dist = Math.hypot(dx, dz);
      expect(dist, `${mb.name} position must sit inside its zone (radius ${zone.radius})`).toBeLessThanOrEqual(zone.radius);
      // Wiki receives the explicit boss position when calling getMobZones for that mob type.
      const refs = getMobZones(mb.type).filter((r) => r.zone.id === zone.id);
      expect(refs.length).toBeGreaterThan(0);
      expect(refs[0].position).toEqual(mb.position);
    }
  });
});
