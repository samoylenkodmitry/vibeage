import { describe, expect, it } from 'vitest';
import { arcLift, spiralOffset, FLYING_MECHANICS } from '../apps/client/src/vfx/spellFx';

describe('projectile delivery path math', () => {
  it('arc lift is zero at both ends and peaks at mid-flight', () => {
    // The arc must rejoin the straight server path exactly where the impact
    // lands — otherwise the lobbed projectile would visually miss the target.
    expect(arcLift(0)).toBe(0);
    expect(arcLift(1)).toBeCloseTo(0, 10);
    expect(arcLift(0.5)).toBeCloseTo(2.4, 10);   // default height
    expect(arcLift(0.5, 3)).toBeCloseTo(3, 10);
    // Symmetric and always non-negative (never dips below the path).
    expect(arcLift(0.25)).toBeCloseTo(arcLift(0.75), 10);
    for (let p = 0; p <= 1.0001; p += 0.1) expect(arcLift(p)).toBeGreaterThanOrEqual(0);
  });

  it('spiral offset tapers to the path at both ends', () => {
    const start = spiralOffset(0);
    const end = spiralOffset(1);
    expect(Math.hypot(start.x, start.y)).toBeCloseTo(0, 10);
    expect(Math.hypot(end.x, end.y)).toBeCloseTo(0, 10);
    // Mid-flight the corkscrew is at (near) full radius.
    const mid = spiralOffset(0.5, 0.55, 8);
    expect(Math.hypot(mid.x, mid.y)).toBeGreaterThan(0.3);
  });

  it('flying mechanics are exactly the ones rendered while traveling', () => {
    expect([...FLYING_MECHANICS].sort()).toEqual(['arc', 'lance', 'projectile', 'spiral']);
    expect(FLYING_MECHANICS.has('strike')).toBe(false);
    expect(FLYING_MECHANICS.has('deluge')).toBe(false);
  });
});
