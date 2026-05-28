import { describe, expect, it } from 'vitest';
import { pickSpecializationHint } from '../apps/client/src/hud/SpecializationHint';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

function makePlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id: 'p1', name: 'Tester', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'warrior', race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 20,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    ...overrides,
  } as PlayerEntity;
}

describe('pickSpecializationHint', () => {
  it('shows when an alive level 20 player has not chosen a specialization', () => {
    expect(pickSpecializationHint(makePlayer())).toEqual({ className: 'Warrior' });
  });

  it('hides before unlock, after choosing a specialization, and while dead', () => {
    expect(pickSpecializationHint(makePlayer({ level: 19 }))).toBeNull();
    expect(pickSpecializationHint(makePlayer({ specializationId: 'berserker' }))).toBeNull();
    expect(pickSpecializationHint(makePlayer({ isAlive: false }))).toBeNull();
  });
});
