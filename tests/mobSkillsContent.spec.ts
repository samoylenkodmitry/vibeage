import { describe, expect, it } from 'vitest';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { SKILLS } from '../packages/content/skills';

/**
 * Spec integrity for mob abilities (P1 of docs/UNIFIED_OFFENSE.md). The
 * engine and the wiki both read `EnemyTemplate.skills` as the single
 * source of truth, so every mob must declare ≥1 valid skill.
 */
describe('mob skills — spec integrity', () => {
  const entries = Object.entries(ENEMY_TEMPLATES);

  it('there are mob templates to check', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('every mob template declares at least one skill', () => {
    for (const [type, t] of entries) {
      expect(t.skills.length, `${type} has no skills`).toBeGreaterThan(0);
    }
  });

  it('every referenced mob skill resolves to a SkillDef', () => {
    for (const [type, t] of entries) {
      for (const id of t.skills) {
        expect(SKILLS[id], `${type} references unknown skill ${id}`).toBeDefined();
      }
    }
  });

  it('every mob carries the universal mobStrike as its guaranteed fallback', () => {
    for (const [type, t] of entries) {
      expect(t.skills, `${type} must include mobStrike`).toContain('mobStrike');
      // mobStrike (cooldown 0) is the always-ready fallback, so it's listed
      // last — signature skills come first in selection priority.
      expect(t.skills[t.skills.length - 1], `${type} mobStrike should be the last/fallback skill`).toBe('mobStrike');
    }
  });

  it('some mobs carry a signature skill beyond the basic strike', () => {
    const withSignature = entries.filter(([, t]) => t.skills.length > 1);
    expect(withSignature.length).toBeGreaterThan(0);
  });
});
