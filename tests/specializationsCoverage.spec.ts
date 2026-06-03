import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import { SKILLS } from '../packages/content/skills';
import {
  SPECIALIZATIONS,
  SPECIALIZATION_UNLOCK_LEVEL,
  PROFICIENCY_LEVEL,
  getSpecializationsForClass,
  getSpecializationById,
} from '../packages/content/specializations';

describe('specializations coverage', () => {
  it('every base class has exactly two specializations', () => {
    for (const className of Object.keys(CLASS_SKILL_TREES) as CharacterClass[]) {
      const specs = getSpecializationsForClass(className);
      expect(specs.length, `${className} should have two specializations, got ${specs.length}`).toBe(2);
    }
  });

  it('every spec entry has unlockLevel === SPECIALIZATION_UNLOCK_LEVEL and proficiencyLevel === PROFICIENCY_LEVEL', () => {
    for (const spec of Object.values(SPECIALIZATIONS)) {
      expect(spec.unlockLevel).toBe(SPECIALIZATION_UNLOCK_LEVEL);
      expect(spec.proficiencyLevel).toBe(PROFICIENCY_LEVEL);
    }
  });

  it('spec and proficiency skill tiers match their displayed level requirements', () => {
    for (const spec of Object.values(SPECIALIZATIONS)) {
      for (const skillId of spec.specSkills ?? []) {
        expect(SKILLS[skillId].levelRequired, `${spec.id}.${skillId} should unlock at spec level`).toBe(SPECIALIZATION_UNLOCK_LEVEL);
      }
      for (const skillId of spec.proficiencySkills ?? []) {
        expect(SKILLS[skillId].levelRequired, `${spec.id}.${skillId} should unlock at proficiency level`).toBe(PROFICIENCY_LEVEL);
      }
    }
  });

  it('getSpecializationById returns undefined for unknown ids and the entry for known ones', () => {
    expect(getSpecializationById('not-real')).toBeUndefined();
    expect(getSpecializationById('arcanist')?.baseClass).toBe('mage');
  });

  it('every spec passive has a name + description', () => {
    for (const spec of Object.values(SPECIALIZATIONS)) {
      expect(spec.specializationPassive.name.length).toBeGreaterThan(0);
      expect(spec.specializationPassive.description.length).toBeGreaterThan(0);
      expect(spec.proficiencyPassive.name.length).toBeGreaterThan(0);
      expect(spec.proficiencyPassive.description.length).toBeGreaterThan(0);
    }
  });
});
