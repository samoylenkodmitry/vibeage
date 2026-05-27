import { describe, expect, it } from 'vitest';
import { listMobTemplates } from '../packages/content/mobLocations';
import { ENEMY_BASE_SCALING, resolveEnemyCombat } from '../packages/content/enemies';
import { SKILLS } from '../packages/content/skills';

/**
 * P3 of docs/UNIFIED_OFFENSE.md — the wiki renders every mob's full
 * stats + skills from the single spec. This asserts the DATA the Mobs
 * tab renders is complete for EVERY registered mob, so "open the wiki
 * and every mob shows its stats and abilities" is enforced in CI rather
 * than spot-checked by hand.
 */
describe('wiki mobs — every mob has a full spec-derived stat block + abilities', () => {
  const mobs = listMobTemplates();

  it('the catalog is non-trivial', () => {
    expect(mobs.length).toBeGreaterThan(10);
  });

  it('every mob has a complete, positive stat block (the wiki summary)', () => {
    const S = ENEMY_BASE_SCALING;
    for (const t of mobs) {
      const hp = (S.health.flat + S.health.perLevel) * t.stats.health;
      const atk = (S.damage.flat + S.damage.perLevel) * t.stats.damage;
      expect(hp, `${t.type} HP`).toBeGreaterThan(0);
      expect(atk, `${t.type} attack`).toBeGreaterThan(0);
      const combat = resolveEnemyCombat(t);
      for (const key of ['accuracy', 'evasion', 'pDef', 'mDef', 'hpRegen'] as const) {
        expect(typeof combat[key], `${t.type}.${key} must be a number`).toBe('number');
      }
    }
  });

  it('every mob declares ≥1 ability, each resolving to a named, described skill', () => {
    for (const t of mobs) {
      expect(t.skills.length, `${t.type} has no abilities`).toBeGreaterThan(0);
      for (const id of t.skills) {
        const skill = SKILLS[id];
        expect(skill, `${t.type} → unknown skill ${id}`).toBeDefined();
        expect(skill.name.length, `${id} name`).toBeGreaterThan(0);
        expect(skill.description.length, `${id} description`).toBeGreaterThan(0);
      }
    }
  });
});
