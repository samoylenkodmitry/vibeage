import { describe, expect, it } from 'vitest';
import {
  buildSpecializationChoices,
  canChooseSpecialization,
} from '../apps/client/src/hud/SpecializationChooser';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

function makePlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id: 'p1', name: 'Tester', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: ['fireball'],
    availableSkillPoints: 1, level: 20,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    ...overrides,
  } as PlayerEntity;
}

describe('SpecializationChooser', () => {
  it('offers the current class specs at level 20 before a spec is chosen', () => {
    const player = makePlayer({ className: 'mage' });
    const choices = buildSpecializationChoices(player);

    expect(canChooseSpecialization(player)).toBe(true);
    expect(choices.map((choice) => choice.id)).toEqual(['arcanist', 'pyromancer']);
    expect(choices[0].passiveName.length).toBeGreaterThan(0);
    expect(choices[0].identity).toBe('Arcane controller');
    expect(choices[0].loop).toContain('Create charges');
    expect(choices[0].specSkills.length).toBeGreaterThan(0);
    expect(choices[0].mechanics).toContain('Pull');
  });

  it('does not show the chooser before level 20, after picking a spec, or while dead', () => {
    expect(canChooseSpecialization(makePlayer({ level: 19 }))).toBe(false);
    expect(canChooseSpecialization(makePlayer({ specializationId: 'arcanist' }))).toBe(false);
    expect(canChooseSpecialization(makePlayer({ isAlive: false }))).toBe(false);
  });
});
