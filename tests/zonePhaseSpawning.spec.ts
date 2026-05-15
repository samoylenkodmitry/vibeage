import { describe, expect, test } from 'vitest';
import { ZoneManager, type Zone } from '../packages/content/zones';
import { DEFAULT_DAY_DURATION_MS } from '../packages/sim/timeOfDay';

const zone: Zone = {
  id: 'phase-test',
  name: 'Phase Test',
  description: 'test',
  position: { x: 0, y: 0, z: 0 },
  radius: 100,
  minLevel: 1,
  maxLevel: 1,
  mobs: [
    { type: 'wolf', weight: 50, minCount: 1, maxCount: 1 },
    { type: 'skeleton', weight: 50, minCount: 1, maxCount: 1, activePhases: ['dusk', 'night'] },
    { type: 'meadow_sprite', weight: 50, minCount: 1, maxCount: 1, activePhases: ['dawn', 'day'] },
  ],
};

const zoneManager = new ZoneManager({ zones: [zone] });
const dayMs = DEFAULT_DAY_DURATION_MS * 0.3;
const nightMs = DEFAULT_DAY_DURATION_MS * 0.9;

describe('zone manager phase filtering', () => {
  test('skips night-only mobs during the day', () => {
    const types = zoneManager.getMobsToSpawn('phase-test', dayMs).map((mob) => mob.type);
    expect(types).toContain('wolf');
    expect(types).toContain('meadow_sprite');
    expect(types).not.toContain('skeleton');
  });

  test('skips day-only mobs at night', () => {
    const types = zoneManager.getMobsToSpawn('phase-test', nightMs).map((mob) => mob.type);
    expect(types).toContain('wolf');
    expect(types).toContain('skeleton');
    expect(types).not.toContain('meadow_sprite');
  });
});
