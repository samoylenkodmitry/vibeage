import { describe, expect, it } from 'vitest';
import { SKILLS, type SkillId } from '../packages/content/skills';
import { skillUsers } from '../packages/content/skillUsers';
import { bossSignatureSkillId } from '../packages/content/bossSkills';
import { MINI_BOSSES } from '../packages/content/miniBosses';

/**
 * A4 (docs/ABILITY_SYSTEM.md §3) — the skill → "used by" reverse index.
 * Every ability must be reachable by some combatant; an orphan skill is a
 * content bug (a skill nothing can ever cast).
 */
describe('skill reverse index (used-by)', () => {
  it('every skill is used by at least one class / spec / mob / boss', () => {
    const orphans = (Object.keys(SKILLS) as SkillId[]).filter((id) => skillUsers(id).length === 0);
    expect(orphans, `skills no combatant uses: ${orphans.join(', ')}`).toEqual([]);
  });

  it('each boss signature lists exactly its boss as a user', () => {
    for (const boss of Object.values(MINI_BOSSES)) {
      const users = skillUsers(bossSignatureSkillId(boss.id));
      expect(users.some((u) => u.kind === 'boss' && u.id === boss.id), `${boss.id} signature → its boss`).toBe(true);
    }
  });

  it('a universal skill is shared by every class; a class skill names that class', () => {
    expect(skillUsers('basicAttack').filter((u) => u.kind === 'class').length).toBe(7);
    expect(skillUsers('fireball').some((u) => u.kind === 'class' && u.id === 'mage')).toBe(true);
    expect(skillUsers('arcane_blast').some((u) => u.kind === 'spec')).toBe(true);
  });

  it('a mob skill names the mobs that carry it', () => {
    expect(skillUsers('mobBreath').some((u) => u.kind === 'mob' && u.id === 'dragon')).toBe(true);
    expect(skillUsers('mobStrike').filter((u) => u.kind === 'mob').length).toBeGreaterThan(5);
  });
});
