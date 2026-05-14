import { afterEach, describe, expect, test, vi } from 'vitest';
import { GAME_ZONES, ZoneManager } from '../packages/content/zones';
import { validateWorldContent } from '../packages/content/worldContentValidation';

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
});
