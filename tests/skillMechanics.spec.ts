import { describe, expect, it } from 'vitest';
import { describeOffense, describeReactions } from '../apps/client/src/hud/skillMechanics';
import { skillMechanicLabels } from '../packages/content/skillMechanics';
import { SKILLS } from '../packages/content/skills';

describe('describeOffense', () => {
  it('returns nothing for a skill with no offense flags', () => {
    expect(describeOffense(undefined)).toEqual([]);
    expect(describeOffense(SKILLS.fireball.offense)).toEqual([]);
  });
  it('describes execute scaling (B9)', () => {
    expect(describeOffense(SKILLS.execute.offense)).toContain("Execute: up to +150% as the target's HP drops");
  });
  it('describes crit, lifesteal and armor-pen', () => {
    expect(describeOffense(SKILLS.lucky_strike.offense).join(' ')).toMatch(/\+50% crit chance/);
    expect(describeOffense(SKILLS.soul_eater.offense).join(' ')).toMatch(/Lifesteal: heals 50%/);
    expect(describeOffense(SKILLS.shadow_strike.offense).join(' ')).toMatch(/Ignores 500/);
  });
  it('describes conditional skill reactions', () => {
    expect(describeReactions(SKILLS.fireball.reactions).join(' ')).toMatch(/Consumes existing Burn/);
    expect(describeReactions(undefined)).toEqual([]);
  });
  it('labels every custom behavior skill for tooltip/wiki UX', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (!skill.customBehavior) continue;
      expect(skillMechanicLabels(skill).length, `${id} needs mechanic labels`).toBeGreaterThan(0);
    }
  });
});
