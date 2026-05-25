import { describe, expect, it } from 'vitest';
import { shouldShowWelcome } from '../apps/client/src/hud/WelcomeOverlay';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

// §49/M2 — first-time welcome overlay visibility predicate.

function makePlayer(over: Partial<PlayerEntity>): PlayerEntity {
  return {
    id: 'p', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null, skillLevels: {},
    ...over,
  } as PlayerEntity;
}

describe('shouldShowWelcome', () => {
  it('returns false when no player loaded yet', () => {
    expect(shouldShowWelcome(null, false)).toBe(false);
  });

  it('returns false when the player has dismissed the overlay', () => {
    expect(shouldShowWelcome(makePlayer({}), true)).toBe(false);
  });

  it('returns true on a fresh L1 player with no quest activity', () => {
    expect(shouldShowWelcome(makePlayer({}), false)).toBe(true);
  });

  it('returns false past level 1 — the player is no longer "new"', () => {
    expect(shouldShowWelcome(makePlayer({ level: 2 }), false)).toBe(false);
  });

  it('returns false once any quest is active', () => {
    const player = makePlayer({ questState: { active: { rats_in_the_cellar: { stageIndex: 0, progress: 0 } }, completed: [] } });
    expect(shouldShowWelcome(player, false)).toBe(false);
  });

  it('returns false once any quest is completed', () => {
    const player = makePlayer({ questState: { active: {}, completed: ['rats_in_the_cellar'] } });
    expect(shouldShowWelcome(player, false)).toBe(false);
  });
});
