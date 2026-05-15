import { describe, expect, test } from 'vitest';
import { WORLD_SETTINGS } from '../packages/content/world';
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

  test('starter zone spawn config can produce every starter enemy type across the day cycle', () => {
    const manager = new ZoneManager();
    const dayMs = 12 * 60 * 1000 * 0.3;
    const nightMs = 12 * 60 * 1000 * 0.9;
    const dayTypes = manager.getMobsToSpawn(STARTER_VERTICAL_SLICE.zoneId, dayMs).map((spawn) => spawn.type);
    const nightTypes = manager.getMobsToSpawn(STARTER_VERTICAL_SLICE.zoneId, nightMs).map((spawn) => spawn.type);
    const combined = new Set([...dayTypes, ...nightTypes]);

    for (const type of ['goblin', 'wolf', 'skeleton', 'slime', 'meadow_sprite']) {
      expect(combined.has(type)).toBe(true);
    }
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

  test('visible world settings cover every configured zone', () => {
    const zones = new ZoneManager().getZones();

    for (const zone of zones) {
      const distanceFromOrigin = Math.hypot(zone.position.x, zone.position.z) + zone.radius;
      expect(distanceFromOrigin).toBeLessThanOrEqual(WORLD_SETTINGS.playableRadius);
    }

    expect(WORLD_SETTINGS.groundSize).toBeGreaterThanOrEqual(WORLD_SETTINGS.playableRadius * 2);
  });
});
