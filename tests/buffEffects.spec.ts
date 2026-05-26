import { describe, expect, it } from 'vitest';
import { buildContributions, computeAllStats, type StatPlayerView } from '../packages/sim/statContributions';
import { SKILLS } from '../packages/content/skills';
import type { StatusEffect } from '../packages/protocol/messages';

/**
 * Roadmap B5/B6/B7/D17 — buff skills now do what their text says:
 *   bless     → +damage AND +hit chance (accuracy)
 *   rapidFire → an attackSpeed buff (was a damage buff)
 *   wind_dash → speed_boost + aggroReset (was a dodge buff)
 */

const base: StatPlayerView = {
  level: 20, className: 'healer', race: 'human', unlockedSkills: [],
};

function totalsWith(effects: StatusEffect[]) {
  const view = { ...base, statusEffects: effects };
  return computeAllStats(buildContributions(view), {
    level: view.level, race: 'human', className: view.className, health: 1000, maxHealth: 1000,
  }).totals;
}

function eff(type: string, value: number): StatusEffect {
  return { id: `e-${type}`, type, value, durationMs: 10_000, startTimeTs: Date.now(), sourceSkill: 't' } as StatusEffect;
}

describe('bless buffs damage AND accuracy (B5)', () => {
  it('raises both dmgMult and accuracy by the bless value', () => {
    const before = totalsWith([]);
    const after = totalsWith([eff('bless', 25)]);
    expect(after.dmgMult).toBeCloseTo(before.dmgMult * 1.25, 5); // +25% damage
    expect(after.accuracy).toBe(before.accuracy + 25);            // +25 accuracy
  });
});

describe('attackSpeed / speed_boost buffs raise their stats (B6/B7/D17)', () => {
  it('an attackSpeed buff raises the attackSpeed stat', () => {
    const before = totalsWith([]);
    const after = totalsWith([eff('attackSpeed', 40)]);
    expect(after.attackSpeed).toBeCloseTo(before.attackSpeed * 1.4, 0);
  });
  it('a speed_boost buff raises runSpeed', () => {
    const before = totalsWith([]);
    const after = totalsWith([eff('speed_boost', 30)]);
    // runSpeed totals are integer-rounded, so the ratio is approximate.
    expect(after.runSpeed).toBeCloseTo(before.runSpeed * 1.3, 0);
    expect(after.runSpeed).toBeGreaterThan(before.runSpeed);
  });
});

describe('skills emit the right effects', () => {
  it('rapidFire is an attackSpeed buff, not a damage buff', () => {
    expect(SKILLS.rapidFire.effects.map((e) => e.type)).toEqual(['attackSpeed']);
  });
  it('wind_dash is a speed burst that breaks pursuit', () => {
    expect(SKILLS.wind_dash.effects.map((e) => e.type)).toEqual(['speed_boost', 'aggroReset']);
  });
});
