import { describe, expect, test } from 'vitest';
import {
  BIOME_ENCOUNTER_TABLES,
  getBiomeEncounterMobs,
  type BiomeEncounterTableId,
} from '../packages/content/encounters';
import { GAME_ZONES } from '../packages/content/zones';

describe('biome encounter tables', () => {
  test('provide reusable mob mixes for continent-scale zones', () => {
    const tableIds = Object.keys(BIOME_ENCOUNTER_TABLES) as BiomeEncounterTableId[];

    expect(tableIds.length).toBeGreaterThanOrEqual(6);
    for (const tableId of tableIds) {
      const mobs = getBiomeEncounterMobs(tableId);
      expect(mobs.length).toBeGreaterThanOrEqual(3);
      expect(mobs.every((mob) => mob.maxCount >= mob.minCount)).toBe(true);
    }
  });

  test('returns fresh mob arrays so zones cannot mutate shared tables', () => {
    const first = getBiomeEncounterMobs('emerald_grassland');
    const second = getBiomeEncounterMobs('emerald_grassland');

    first[0].maxCount = 99;

    expect(second[0].maxCount).not.toBe(99);
  });

  test('backs the current enormous zones with biome tables', () => {
    const emeraldZone = GAME_ZONES.find((zone) => zone.id === 'emerald_expanse');

    expect(emeraldZone?.mobs).toEqual(getBiomeEncounterMobs('emerald_grassland'));
  });
});
