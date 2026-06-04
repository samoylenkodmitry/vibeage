import { describe, expect, it } from 'vitest';
import { pickFrontierGuideHint } from '../apps/client/src/hud/FrontierGuideHint';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

function makePlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id: 'p1', name: 'Tester', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'warrior', race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 24,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: 'berserker',
    skillLevels: {},
    ...overrides,
  } as PlayerEntity;
}

describe('pickFrontierGuideHint', () => {
  it('shows for specced level 20-30 players', () => {
    expect(pickFrontierGuideHint(makePlayer())).toEqual({
      npcName: 'Roadwarden Saila',
      levelRange: 'Lv 24-30',
    });
  });

  it('hides before spec choice, outside the bridge range, and while dead', () => {
    expect(pickFrontierGuideHint(makePlayer({ specializationId: null }))).toBeNull();
    expect(pickFrontierGuideHint(makePlayer({ level: 19 }))).toBeNull();
    expect(pickFrontierGuideHint(makePlayer({ level: 31 }))).toBeNull();
    expect(pickFrontierGuideHint(makePlayer({ isAlive: false }))).toBeNull();
  });
});
