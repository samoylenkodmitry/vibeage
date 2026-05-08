import { describe, expect, it } from 'vitest';
import { GAME_ZONES, ZoneManager } from '../packages/content/zones.js';

describe('zone definitions', () => {
  it('exports the current starter zone first', () => {
    expect(GAME_ZONES[0]?.id).toBe('starter_meadow');
  });

  it('finds a zone by position', () => {
    const zones = new ZoneManager();

    expect(zones.getZoneAtPosition({ x: 0, y: 0, z: 0 })?.id).toBe('starter_meadow');
    expect(zones.getZoneAtPosition({ x: 10000, y: 0, z: 10000 })).toBeNull();
  });

  it('returns spawn counts inside each configured range', () => {
    const zones = new ZoneManager();
    const spawnConfig = zones.getMobsToSpawn('starter_meadow');
    const starterMobs = GAME_ZONES[0]?.mobs ?? [];

    expect(spawnConfig).toHaveLength(starterMobs.length);
    for (const [index, spawn] of spawnConfig.entries()) {
      const mob = starterMobs[index];
      expect(spawn.type).toBe(mob.type);
      expect(spawn.count).toBeGreaterThanOrEqual(mob.minCount);
      expect(spawn.count).toBeLessThanOrEqual(mob.maxCount);
    }
  });
});
