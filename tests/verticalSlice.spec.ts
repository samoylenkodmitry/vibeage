import { describe, expect, test } from 'vitest';
import { ZoneManager } from '../packages/content/zones';
import {
  STARTER_VERTICAL_SLICE,
  getStarterVerticalSliceSkills,
  getStarterVerticalSliceZone,
  inspectStarterVerticalSliceContent,
} from '../packages/content/verticalSlice';
import { validateStarterVerticalSlice } from '../server/gameplay/verticalSlice';

describe('starter vertical slice', () => {
  test('defines one low-level zone, one class, three skills, and five enemy types', () => {
    const zone = getStarterVerticalSliceZone();

    expect(STARTER_VERTICAL_SLICE.className).toBe('mage');
    expect(zone.id).toBe(STARTER_VERTICAL_SLICE.zoneId);
    expect(zone.minLevel).toBe(1);
    expect(zone.maxLevel).toBe(3);
    expect(getStarterVerticalSliceSkills().map((skill) => skill?.id)).toEqual([
      'fireball',
      'waterSplash',
      'iceBolt',
    ]);
    expect(zone.mobs.map((mob) => mob.type)).toEqual(expect.arrayContaining([
      'goblin',
      'wolf',
      'skeleton',
      'slime',
      'meadow_sprite',
    ]));
  });

  test('starter zone spawn config can produce every starter enemy type', () => {
    const spawns = new ZoneManager().getMobsToSpawn(STARTER_VERTICAL_SLICE.zoneId);

    expect(spawns.map((spawn) => spawn.type)).toEqual(expect.arrayContaining([
      'goblin',
      'wolf',
      'skeleton',
      'slime',
      'meadow_sprite',
    ]));
    expect(spawns.every((spawn) => spawn.count > 0)).toBe(true);
  });

  test('content and server runtime dependencies are present for the slice', () => {
    expect(inspectStarterVerticalSliceContent()).toEqual({
      isComplete: true,
      missingSkills: [],
      missingEnemyTypes: [],
    });
    expect(validateStarterVerticalSlice()).toEqual({
      ok: true,
      issues: [],
      lootTableIds: ['goblin_loot', 'wolf_loot', 'skeleton_loot', 'slime_loot', 'meadow_sprite_loot'],
    });
  });
});
