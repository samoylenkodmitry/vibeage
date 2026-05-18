import { describe, expect, it } from 'vitest';
import { SPECIALIZATIONS, getSpecForSkill, type Specialization } from '../packages/content/specializations';
import { SKILLS } from '../packages/content/skills';
import { canPlayerLearnSkill } from '../server/players/playerSkills';
import type { SkillId } from '../packages/content/skills';

function fakePlayer(overrides: Partial<{
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  availableSkillPoints: number;
  specializationId: string | null;
}> = {}) {
  return {
    id: 'p1',
    level: 30,
    className: 'mage',
    unlockedSkills: ['basicAttack', 'escape'] as SkillId[],
    skillShortcuts: [],
    availableSkillPoints: 1,
    specializationId: null as string | null,
    ...overrides,
  };
}

describe('spec / proficiency skill catalog coverage', () => {
  it('every specSkill + proficiencySkill referenced by a spec has a SKILLS entry', () => {
    for (const spec of Object.values(SPECIALIZATIONS) as Specialization[]) {
      for (const id of [...(spec.specSkills ?? []), ...(spec.proficiencySkills ?? [])]) {
        expect(SKILLS[id], `${spec.id} → ${id}`).toBeDefined();
      }
    }
  });
  it('getSpecForSkill resolves any spec/proficiency skill to its owning spec', () => {
    const e = getSpecForSkill('arcane_blast');
    expect(e?.spec.id).toBe('arcanist');
    expect(e?.tier).toBe('spec');
    const p = getSpecForSkill('arcane_supremacy');
    expect(p?.spec.id).toBe('arcanist');
    expect(p?.tier).toBe('proficiency');
    expect(getSpecForSkill('fireball')).toBeNull();
  });
});

describe('canPlayerLearnSkill — spec gate', () => {
  it('rejects spec skill when player has no specialization', () => {
    const p = fakePlayer({ specializationId: null });
    expect(canPlayerLearnSkill(p, 'arcane_blast')).toBe(false);
  });
  it('rejects spec skill when player is on a different spec', () => {
    const p = fakePlayer({ specializationId: 'pyromancer' });
    expect(canPlayerLearnSkill(p, 'arcane_blast')).toBe(false);
  });
  it('rejects spec skill when level is below 20', () => {
    const p = fakePlayer({ specializationId: 'arcanist', level: 10 });
    expect(canPlayerLearnSkill(p, 'arcane_blast')).toBe(false);
  });
  it('accepts spec skill at lv 20 with the matching spec', () => {
    const p = fakePlayer({ specializationId: 'arcanist', level: 20 });
    expect(canPlayerLearnSkill(p, 'arcane_blast')).toBe(true);
  });
  it('rejects proficiency skill until level 40', () => {
    const p = fakePlayer({ specializationId: 'arcanist', level: 30 });
    expect(canPlayerLearnSkill(p, 'arcane_supremacy')).toBe(false);
  });
  it('accepts proficiency skill at lv 40 with the matching spec', () => {
    const p = fakePlayer({ specializationId: 'arcanist', level: 40 });
    expect(canPlayerLearnSkill(p, 'arcane_supremacy')).toBe(true);
  });
});
