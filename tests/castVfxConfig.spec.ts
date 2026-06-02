import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import {
  getCastEffectRadius,
  getCastVisibleMs,
  getTimeStopDurationMs,
  TIME_FIELD_FADE_MS,
} from '../apps/client/src/vfx/castVfxConfig';

describe('cast VFX config', () => {
  it('uses Time Sphere content radius for dome size', () => {
    expect(SKILLS.time_sphere.area).toBe(8);
    expect(SKILLS.time_sphere.shape).toMatchObject({
      anchor: 'target',
      kind: 'circle',
      radius: 8,
    });
    expect(getCastEffectRadius('time_sphere')).toBe(8);
  });

  it('keeps Time Sphere visible through the stop duration plus fade', () => {
    const durationMs = getTimeStopDurationMs('time_sphere');

    expect(durationMs).toBe(3500);
    expect(getCastVisibleMs('time_sphere')).toBe(durationMs + TIME_FIELD_FADE_MS);
  });
});
