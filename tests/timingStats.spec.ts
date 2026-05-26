import { describe, expect, it } from 'vitest';
import { attackSpeedCooldownFactor, effectiveCastMs } from '../packages/sim/combatMath';
import { ATTACK_SPEED_BASELINE } from '../packages/content/stats';
import { applySkillCostAndCooldown } from '../server/combat/cooldowns';
import { createTransientPlayer } from '../server/playerFactory';
import { SKILLS } from '../packages/content/skills';

/**
 * attackSpeed and castSpeed were dead — stored + shown but read by no
 * cooldown / cast-time code. They now drive real cadence (roadmap A3/A4).
 */

describe('castSpeed → cast time', () => {
  it('baseline castSpeed 1 leaves the cast unchanged', () => {
    expect(effectiveCastMs(1000, 1)).toBe(1000);
    expect(effectiveCastMs(1000, undefined)).toBe(1000);
  });
  it('higher castSpeed shortens the cast', () => {
    expect(effectiveCastMs(1000, 2)).toBe(500);
    expect(effectiveCastMs(900, 1.5)).toBe(600);
  });
  it('never lengthens a cast (castSpeed floored at 1)', () => {
    expect(effectiveCastMs(1000, 0.5)).toBe(1000);
  });
});

describe('attackSpeed → auto-attack cooldown', () => {
  it('baseline attackSpeed leaves the interval unchanged', () => {
    expect(attackSpeedCooldownFactor(ATTACK_SPEED_BASELINE)).toBe(1);
    expect(attackSpeedCooldownFactor(undefined)).toBe(1);
  });
  it('more attackSpeed = shorter interval', () => {
    expect(attackSpeedCooldownFactor(ATTACK_SPEED_BASELINE * 2)).toBeCloseTo(0.5, 5);
  });

  it('only auto-repeat skills get the attackSpeed cut', () => {
    const fast = createTransientPlayer('s1', 'fast');
    fast.stats = { ...(fast.stats ?? {}), attackSpeed: ATTACK_SPEED_BASELINE * 2 };
    const now = 1_000_000;

    // Basic Attack is autoRepeat → cooldown halved.
    const basic = SKILLS.basicAttack;
    applySkillCostAndCooldown(fast, 'basicAttack', basic, now);
    const basicCd = (fast.skillCooldownEndTs?.basicAttack ?? now) - now;
    expect(basicCd).toBeCloseTo((basic.cooldownMs ?? 0) * 0.5, 0);

    // Fireball is not autoRepeat → full cooldown.
    const fireball = SKILLS.fireball;
    applySkillCostAndCooldown(fast, 'fireball', fireball, now);
    const fbCd = (fast.skillCooldownEndTs?.fireball ?? now) - now;
    expect(fbCd).toBeCloseTo(fireball.cooldownMs ?? 0, 0);
  });
});
