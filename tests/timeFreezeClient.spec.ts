import { describe, expect, it } from 'vitest';
import { isEntityInActiveTimeField } from '../apps/client/src/timeFreeze';
import type { TimeStopFieldSnapshot } from '../packages/protocol/messages';

const NOW = 1_000_000;

describe('client time-freeze helpers', () => {
  it('detects frozen entities and mirrors the caster exclusion for UI timers', () => {
    const fields: Record<string, TimeStopFieldSnapshot> = {
      field: {
        id: 'field',
        kind: 'timeStop',
        sourceSkill: 'time_sphere',
        casterId: 'caster',
        origin: { x: 0, z: 0 },
        radius: 5,
        startTimeTs: NOW,
        durationMs: 3_500,
      },
    };

    expect(isEntityInActiveTimeField(fields, 'target', { x: 1, z: 1 }, NOW + 1_000)).toBe(true);
    expect(isEntityInActiveTimeField(fields, 'caster', { x: 1, z: 1 }, NOW + 1_000)).toBe(false);
    expect(isEntityInActiveTimeField(fields, 'target', { x: 10, z: 0 }, NOW + 1_000)).toBe(false);
    expect(isEntityInActiveTimeField(fields, 'target', { x: 1, z: 1 }, NOW + 4_000)).toBe(false);
  });
});
