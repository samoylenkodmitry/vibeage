import { describe, expect, it } from 'vitest';
import { mitigatedDamage } from '../packages/sim/combatMath';
import { DEFENSE_HALF_REDUCTION } from '../packages/content/stats';

/**
 * P.Def / M.Def used to be dead stats — computed, shown, gear-scaled,
 * but read by no combat code. `mitigatedDamage` is the shared curve
 * the damage pipeline applies by attack kind so defense finally reduces
 * incoming damage. (That mob swings run it lives in
 * mobAttackDefensivePipeline.spec.ts, on the live cast path.)
 */

describe('mitigatedDamage curve', () => {
  it('no defense → full damage', () => {
    expect(mitigatedDamage(100, 0)).toBe(100);
    expect(mitigatedDamage(100, -50)).toBe(100); // negative clamps to 0
  });
  it('defense == K halves the damage', () => {
    expect(mitigatedDamage(100, DEFENSE_HALF_REDUCTION)).toBeCloseTo(50, 5);
  });
  it('diminishing returns — never zeroes a hit', () => {
    const huge = mitigatedDamage(100, DEFENSE_HALF_REDUCTION * 99); // 1% gets through
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeCloseTo(1, 1);
  });
  it('penetration lowers the target effective defense', () => {
    const full = mitigatedDamage(100, DEFENSE_HALF_REDUCTION);
    const pierced = mitigatedDamage(100, DEFENSE_HALF_REDUCTION, DEFENSE_HALF_REDUCTION); // fully pierced
    expect(pierced).toBe(100);
    expect(pierced).toBeGreaterThan(full);
  });
});
