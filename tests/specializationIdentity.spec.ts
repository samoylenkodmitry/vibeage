import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { skillMechanicSummary } from '../packages/content/skillMechanics';
import { SPECIALIZATION_IDENTITIES } from '../packages/content/specializationIdentity';
import { SPECIALIZATIONS, type SpecializationId } from '../packages/content/specializations';

describe('specialization identity audit', () => {
  it('defines a reusable identity row for every specialization', () => {
    expect(Object.keys(SPECIALIZATION_IDENTITIES).sort()).toEqual(Object.keys(SPECIALIZATIONS).sort());

    for (const [specId, identity] of Object.entries(SPECIALIZATION_IDENTITIES) as Array<[SpecializationId, (typeof SPECIALIZATION_IDENTITIES)[SpecializationId]]>) {
      expect(identity.fantasy.length, `${specId} fantasy`).toBeGreaterThan(4);
      expect(identity.primaryLoop.length, `${specId} loop`).toBeGreaterThan(20);
      expect(identity.payoff.length, `${specId} payoff`).toBeGreaterThan(20);
      expect(identity.mechanicTags.length, `${specId} tags`).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps every specialization at or above three spec-tier active skills', () => {
    for (const [specId, spec] of Object.entries(SPECIALIZATIONS)) {
      expect(spec.specSkills?.length ?? 0, `${specId} spec skill count`).toBeGreaterThanOrEqual(3);
      for (const skillId of spec.specSkills ?? []) expect(SKILLS[skillId], `${specId} skill ${skillId}`).toBeDefined();
    }
  });

  it('gives sibling specializations distinct identity and mechanic summaries', () => {
    const specsByBaseClass = new Map<string, SpecializationId[]>();
    for (const spec of Object.values(SPECIALIZATIONS)) {
      specsByBaseClass.set(spec.baseClass, [...(specsByBaseClass.get(spec.baseClass) ?? []), spec.id]);
    }

    for (const [className, specIds] of specsByBaseClass) {
      expect(specIds.length, `${className} branch count`).toBe(2);
      const [a, b] = specIds;
      expect(SPECIALIZATION_IDENTITIES[a].fantasy).not.toBe(SPECIALIZATION_IDENTITIES[b].fantasy);
      expect(specMechanicSummary(a)).not.toBe(specMechanicSummary(b));
    }
  });
});

function specMechanicSummary(specId: SpecializationId): string {
  const spec = SPECIALIZATIONS[specId];
  return skillMechanicSummary((spec.specSkills ?? []).map((skillId) => SKILLS[skillId]));
}
