import { describe, expect, it } from 'vitest';
import { actionBarSeedSkills } from '../apps/client/src/skillShortcuts';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

// Regression guard: the action bar seeds exactly once, so this must NOT return
// the Attack fallback while the player is still streaming in (empty skills) —
// otherwise every class would seed a blank-ish bar before their real skills
// arrive. The Attack fallback fires only for a loaded, classless guest.

function player(unlockedSkills: string[]): PlayerEntity {
  return {
    id: 'p', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills, availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null, skillLevels: {},
  } as unknown as PlayerEntity;
}

describe('actionBarSeedSkills', () => {
  it('returns [] for a not-yet-loaded player (null or no skills) so seeding waits', () => {
    expect(actionBarSeedSkills(null)).toEqual([]);
    expect(actionBarSeedSkills(player([]))).toEqual([]);
  });

  it('seeds the basic Attack for a loaded classless guest (universal skills only)', () => {
    expect(actionBarSeedSkills(player(['basicAttack', 'escape']))).toEqual(['basicAttack']);
  });

  it('seeds the class skills for a normal player (never the Attack fallback)', () => {
    expect(actionBarSeedSkills(player(['fireball', 'basicAttack', 'escape']))).toEqual(['fireball']);
  });
});
