import { describe, expect, it } from 'vitest';
import { SPECIALIZATIONS, type Specialization } from '../packages/content/specializations';

// §45.3 — spec passive descriptions used to promise features the
// SpecializationPassiveModifiers shape can't carry (party auras,
// per-skill cooldown reductions, fire-flavour amplifiers, etc.).
// Trimmed each description to what the data actually does + put
// the planned-but-unwired intent inside a `(planned: …)`
// parenthetical so designers + the wiki can see the gap.
//
// This test prevents drift: if a passive ships with NO modifiers
// AND no `(planned: …)` disclaimer, players see a description
// that does nothing. Loud failure beats a quiet lie.

function hasModifiers(s: { modifiers: Specialization['specializationPassive']['modifiers'] }): boolean {
  return Object.values(s.modifiers as Record<string, number | undefined>)
    .some((v) => v !== undefined && v !== 1 && v !== 0);
}

describe('spec passive description honesty', () => {
  it('every passive with no real modifiers carries a (planned: …) disclaimer', () => {
    const offenders: string[] = [];
    for (const spec of Object.values(SPECIALIZATIONS) as Specialization[]) {
      for (const tier of ['specializationPassive', 'proficiencyPassive'] as const) {
        const passive = spec[tier];
        if (hasModifiers(passive)) continue;
        if (/\(planned:/i.test(passive.description)) continue;
        offenders.push(`${spec.id}.${tier} ("${passive.name}"): empty modifiers + no (planned: …) disclaimer`);
      }
    }
    expect(
      offenders,
      `Spec passives with no working modifiers must disclose it. Either ` +
      `add a numeric modifier in SpecializationPassiveModifiers or wrap the ` +
      `description's promised effect in "(planned: …)":\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
