import { describe, expect, test } from 'vitest';
import { validateWorldContent } from '../server/gameplay/worldContentValidation';

describe('world content validation', () => {
  test('keeps configured zones, spawns, loot, and items internally consistent', () => {
    const report = validateWorldContent();

    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.spawnBudget.configuredMaxInitialEnemySpawns)
      .toBeLessThanOrEqual(report.spawnBudget.maxInitialEnemySpawns);
  });
});
