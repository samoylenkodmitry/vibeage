import { describe, expect, it } from 'vitest';
import { buildContributions, computeAllStats, type StatPlayerView } from '../packages/sim/statContributions';
import { CLASS_AUTO_PASSIVE_SKILL } from '../packages/content/classPassives';
import { PROFICIENCY_LEVEL, SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';

// §45.3 follow-up — `evasionBonus` flat-stat modifier wired from
// SpecializationPassiveModifiers into the evasion stat as an
// addPost contribution. Two specs use it today: Treasure Hunter
// Light Step (+5) and Phantom Ranger Phantom Step (+5 at prof).

function evasionFor(view: StatPlayerView): number {
  return computeAllStats(buildContributions(view), {
    level: view.level, race: view.race ?? 'human', className: view.className, health: 1, maxHealth: 1,
  }).totals.evasion;
}

describe('evasionBonus spec passive', () => {
  it('Treasure Hunter at L20 carries +5 evasion vs an unspecced rogue', () => {
    const base: StatPlayerView = {
      level: SPECIALIZATION_UNLOCK_LEVEL, race: 'human', className: 'rogue',
      unlockedSkills: [CLASS_AUTO_PASSIVE_SKILL.rogue],
    };
    const specced: StatPlayerView = { ...base, specializationId: 'treasure_hunter' };

    expect(evasionFor(specced) - evasionFor(base)).toBe(5);
  });

  it('Phantom Ranger at proficiency (L40) carries +5 evasion via Phantom Step', () => {
    const base: StatPlayerView = {
      level: PROFICIENCY_LEVEL, race: 'human', className: 'ranger',
      unlockedSkills: [CLASS_AUTO_PASSIVE_SKILL.ranger],
    };
    const specced: StatPlayerView = { ...base, specializationId: 'phantom_ranger' };

    expect(evasionFor(specced) - evasionFor(base)).toBe(5);
  });
});
