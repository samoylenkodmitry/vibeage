import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';

/**
 * "You learned X." combat-log line on SkillLearned.
 *
 * Server emits SkillLearned (owner-only) after `onLearnSkill` lands;
 * the SkillTreePanel updates visually, but the combat log was
 * silent. Adds a scroll-back record so a player can see exactly
 * when they unlocked each skill.
 *
 * Key contract: the server re-sends SkillLearned idempotently when
 * the player tries to relearn a skill they already know (see
 * server/players/playerSkills.ts:51-54). The combat log must NOT
 * spam a fresh "You learned X." line on each duplicate.
 */

const ME = 'me';

function makePlayer(id: string, overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id,
    name: id,
    isAlive: true,
    level: 5,
    availableSkillPoints: 1,
    unlockedSkills: ['fireball'],

    skillLevels: { fireball: 1 },
    ...overrides,
  } as unknown as PlayerEntity;
}

function makeState(playerOverrides: Partial<PlayerEntity> = {}): GameClientState {
  return {
    ...initialGameClientState,
    connectionState: 'online' as const,
    myPlayerId: ME,
    players: { [ME]: makePlayer(ME, playerOverrides) },
  };
}

describe('SkillLearned combat-log feedback', () => {
  it('emits "You learned X." on a fresh unlock', () => {
    const state = makeState();
    const next = gameClientReducer(state, {
      type: 'serverMessage', now: 100,
      message: { type: 'SkillLearned', skillId: 'waterSplash', remainingPoints: 0 },
    });
    expect(next.combatLog).toHaveLength(1);
    // Uses the skill's display name when known; falls back to the id.
    expect(next.combatLog[0].text.startsWith('You learned ')).toBe(true);
    expect(next.combatLog[0].text.endsWith('.')).toBe(true);
  });

  it('does NOT emit a second log line when the same SkillLearned arrives twice (idempotent re-send)', () => {
    // Pre-seed unlockedSkills with waterSplash so the second arrival
    // is the idempotent path from server/players/playerSkills.ts:51.
    let state = makeState();
    state = gameClientReducer(state, {
      type: 'serverMessage', now: 100,
      message: { type: 'SkillLearned', skillId: 'waterSplash', remainingPoints: 0 },
    });
    expect(state.combatLog).toHaveLength(1);
    // Re-arrival of the same SkillLearned (relearn idempotency on
    // the server) must NOT spam another line.
    state = gameClientReducer(state, {
      type: 'serverMessage', now: 200,
      message: { type: 'SkillLearned', skillId: 'waterSplash', remainingPoints: 0 },
    });
    expect(state.combatLog).toHaveLength(1);
  });

  it('clears any prior rejection chip for the same skill on success', () => {
    const seeded = {
      ...makeState(),
      learnSkillRejections: { waterSplash: 'levelTooLow' },
    };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 100,
      message: { type: 'SkillLearned', skillId: 'waterSplash', remainingPoints: 0 },
    });
    expect(next.learnSkillRejections.waterSplash).toBeUndefined();
  });

  it('uses the skill display name from content when known', () => {
    // "fireball" is in SKILLS — display name is "Fireball".
    const state = { ...makeState(), players: { [ME]: makePlayer(ME, { unlockedSkills: [] }) } };
    const next = gameClientReducer(state, {
      type: 'serverMessage', now: 100,
      message: { type: 'SkillLearned', skillId: 'fireball', remainingPoints: 0 },
    });
    expect(next.combatLog[0].text).toBe('You learned Fireball.');
  });
});
