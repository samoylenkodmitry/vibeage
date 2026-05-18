import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { getSkillLevel, getSkillUpgradeModifiers } from '../packages/sim/skillUpgrades';

describe('getSkillLevel', () => {
  it('returns 1 when skillLevels is undefined or missing the id', () => {
    expect(getSkillLevel(undefined, 'fireball')).toBe(1);
    expect(getSkillLevel({}, 'fireball')).toBe(1);
  });
  it('clamps below-1 values up to 1', () => {
    expect(getSkillLevel({ fireball: 0 }, 'fireball')).toBe(1);
    expect(getSkillLevel({ fireball: -3 }, 'fireball')).toBe(1);
  });
  it('returns the stored level otherwise', () => {
    expect(getSkillLevel({ fireball: 3 }, 'fireball')).toBe(3);
  });
});

describe('getSkillUpgradeModifiers', () => {
  it('returns identity when the skill has no upgrade tiers', () => {
    const m = getSkillUpgradeModifiers('basicAttack', 5);
    expect(m.dmgMultiplier).toBe(1);
    expect(m.cooldownMultiplier).toBe(1);
    expect(m.rangeBonus).toBe(0);
    expect(m.manaCostMultiplier).toBe(1);
    expect(m.durationMultiplier).toBe(1);
  });

  it('returns identity for level <= 1 even when upgrades exist', () => {
    const m = getSkillUpgradeModifiers('fireball', 1);
    expect(m.dmgMultiplier).toBe(1);
  });

  it('folds each unlocked tier cumulatively (multiplicative for multipliers)', () => {
    const fireball = SKILLS.fireball;
    expect(fireball.upgrades?.length, 'fireball must have upgrade tiers for this test').toBeGreaterThan(0);

    // Level 2 unlocks tier 0 only.
    const lvl2 = getSkillUpgradeModifiers('fireball', 2);
    const tier0 = fireball.upgrades![0].modifiers;
    if (tier0.dmgMultiplier !== undefined) {
      expect(lvl2.dmgMultiplier).toBeCloseTo(tier0.dmgMultiplier);
    }

    // Level past max only folds up to the available number of tiers.
    const maxLevel = 1 + fireball.upgrades!.length;
    const aboveMax = getSkillUpgradeModifiers('fireball', maxLevel + 10);
    const exactlyMax = getSkillUpgradeModifiers('fireball', maxLevel);
    expect(aboveMax).toEqual(exactlyMax);
  });
});
