import { afterEach, describe, expect, test, vi } from 'vitest';
import { createZoneLookup, GAME_ZONES, ZoneManager } from '../packages/content/zones';
import { validateWorldContent } from '../packages/content/worldContentValidation';
import { DEFAULT_WORLD_ZONE_SPAWN_POLICY } from '../server/world/zoneRuntime';

describe('world content validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('keeps configured zones, spawns, loot, and items internally consistent', () => {
    const report = validateWorldContent();

    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.spawnBudget.configuredMaxInitialEnemySpawns)
      .toBeLessThanOrEqual(report.spawnBudget.maxInitialEnemySpawns);
    expect(report.spawnBudget.zoneCount).toBe(GAME_ZONES.length);
    expect(report.spawnBudget.zoneCount).toBeLessThanOrEqual(report.spawnBudget.maxZoneCount);
    expect(report.spawnBudget.configuredMaxEnemiesPerZone)
      .toBeLessThanOrEqual(report.spawnBudget.maxEnemiesPerZone);
    expect(DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveZones).toBeLessThan(GAME_ZONES.length);
    expect(DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveEnemies)
      .toBeLessThanOrEqual(report.spawnBudget.maxRuntimeActiveEnemies);
  });

  test('exposes zones by id for runtime and client lookup paths', () => {
    const zoneManager = new ZoneManager();

    expect(zoneManager.getZoneById('starter_meadow')?.name).toBe('Peaceful Meadows');
    expect(zoneManager.getZoneById('missing-zone')).toBeNull();
  });

  test('supports injected zone lookup maps for large-world runtime paths', () => {
    const starterZone = GAME_ZONES[0];
    const zoneById = createZoneLookup([starterZone]);
    const zoneManager = new ZoneManager({ zones: [starterZone], zoneById });

    expect(zoneManager.getZoneById(starterZone.id)).toBe(starterZone);
    expect(zoneManager.getZones()).toEqual([starterZone]);
  });

  test('keeps starter enemy spawns outside the immediate player spawn area', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const starterZone = GAME_ZONES.find((zone) => zone.id === 'starter_meadow');
    const position = new ZoneManager().getRandomPositionInZone('starter_meadow');

    expect(starterZone?.spawnExclusionRadius).toBeGreaterThan(0);
    expect(position).toBeTruthy();
    expect(Math.hypot(position!.x - starterZone!.position.x, position!.z - starterZone!.position.z))
      .toBeGreaterThanOrEqual(starterZone!.spawnExclusionRadius!);
  });

  test('places large-zone spawns on procedural terrain height', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const position = new ZoneManager().getRandomPositionInZone('emerald_expanse');

    expect(position).toBeTruthy();
    expect(position!.y).not.toBe(0.5);
  });
});
