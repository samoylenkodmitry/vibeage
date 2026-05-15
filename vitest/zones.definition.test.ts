import { describe, expect, it } from 'vitest';
import { GAME_ZONES, ZoneManager } from '../packages/content/zones.js';
import { DEFAULT_DAY_DURATION_MS, dayPhaseLabel, isMobAllowedInPhase } from '../packages/sim/timeOfDay.js';

describe('zone definitions', () => {
  it('exports the current starter zone first', () => {
    expect(GAME_ZONES[0]?.id).toBe('starter_meadow');
  });

  it('finds a zone by position', () => {
    const zones = new ZoneManager();

    expect(zones.getZoneAtPosition({ x: 0, z: 0 })?.id).toBe('starter_meadow');
    expect(zones.getZoneAtPosition({ x: 10000, z: 10000 })).toBeNull();
  });

  it('returns spawn counts inside each configured range for the current phase', () => {
    const zones = new ZoneManager();
    const noonMs = DEFAULT_DAY_DURATION_MS * 0.3;
    const spawnConfig = zones.getMobsToSpawn('starter_meadow', noonMs);
    const eligibleMobs = (GAME_ZONES[0]?.mobs ?? []).filter((mob) =>
      isMobAllowedInPhase(mob.activePhases, dayPhaseLabel(noonMs)),
    );

    expect(spawnConfig).toHaveLength(eligibleMobs.length);
    for (const [index, spawn] of spawnConfig.entries()) {
      const mob = eligibleMobs[index];
      expect(spawn.type).toBe(mob.type);
      expect(spawn.count).toBeGreaterThanOrEqual(mob.minCount);
      expect(spawn.count).toBeLessThanOrEqual(mob.maxCount);
    }
  });
});
