import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import {
  getCastEffectRadius,
  getCastVisibleMs,
  getTimeStopDurationMs,
  TIME_FIELD_FADE_MS,
} from '../apps/client/src/vfx/castVfxConfig';
import { skillThemeFor } from '../apps/client/src/vfx/skillThemeConfig';

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

  it('derives non-default themes for newer custom mechanics', () => {
    expect(skillThemeFor('nightfall_net')).toMatchObject({
      glow: '#6d28d9',
      mechanic: 'nova',
    });
    expect(skillThemeFor('sunbreak_charge')).toMatchObject({
      element: 'holy',
      mechanic: 'spiral',
    });
    expect(skillThemeFor('seismic_rend')).toMatchObject({
      form: 'shard',
      mechanic: 'nova',
    });
  });
});
