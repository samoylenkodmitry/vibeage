import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';

/**
 * §52 #1 — client reducer routes `CommandRejected{commandType:'LearnSkill',
 * targetId:<skillId>}` into `state.learnSkillRejections[skillId]`. Pre-§52
 * the same panel state was populated from the legacy `LearnSkillFailed`
 * message which carried `skillId` as a top-level field; after retirement
 * the envelope's `targetId` carries the same id.
 *
 * A successful `SkillLearned` for the same skill must clear the
 * rejection — otherwise the "you can't learn this" chip would stick
 * on the panel after the player gained the level / prereq.
 */

describe('gameClientReducer — LearnSkill rejection state', () => {
  const baseState = {
    ...initialGameClientState,
    connectionState: 'online' as const,
    myPlayerId: 'me',
    players: {
      me: {
        id: 'me', name: 'me',
        unlockedSkills: ['fireball'],
        availableSkillPoints: 1,
        skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
      } as unknown as (typeof initialGameClientState.players)['me'],
    },
  };

  it('stores the rejection reason under targetId for a LearnSkill CommandRejected', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CommandRejected',
        commandType: 'LearnSkill',
        reason: 'levelTooLow',
        targetId: 'iceBolt',
        requestId: 1,
      },
    });
    expect(next.learnSkillRejections.iceBolt).toBe('levelTooLow');
  });

  it('preserves prior rejections for other skills when a new one comes in', () => {
    const seeded = { ...baseState, learnSkillRejections: { iceBolt: 'levelTooLow' } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CommandRejected',
        commandType: 'LearnSkill',
        reason: 'noSkillPoints',
        targetId: 'arcaneBlast',
      },
    });
    expect(next.learnSkillRejections.iceBolt).toBe('levelTooLow');
    expect(next.learnSkillRejections.arcaneBlast).toBe('noSkillPoints');
  });

  it('ignores LearnSkill rejections that arrive without a targetId (defensive)', () => {
    // The server now always sends targetId for LearnSkill rejections;
    // the reducer still guards in case an older/different code path
    // emits without it.
    const next = gameClientReducer(baseState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CommandRejected',
        commandType: 'LearnSkill',
        reason: 'noSkillPoints',
      },
    });
    expect(next.learnSkillRejections).toEqual({});
  });

  it('does not touch learnSkillRejections for unrelated CommandRejected commandTypes', () => {
    const seeded = { ...baseState, learnSkillRejections: { iceBolt: 'levelTooLow' } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CommandRejected',
        commandType: 'BuyFromVendor',
        reason: 'notEnoughGold',
      },
    });
    expect(next.learnSkillRejections).toEqual({ iceBolt: 'levelTooLow' });
  });

  it('clears the rejection for a skill once SkillLearned arrives (sticky-chip regression net)', () => {
    const seeded = { ...baseState, learnSkillRejections: { iceBolt: 'levelTooLow', arcaneBlast: 'noSkillPoints' } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage',
      now: 200,
      message: {
        type: 'SkillLearned',
        skillId: 'iceBolt',
        remainingPoints: 0,
      },
    });
    expect(next.learnSkillRejections.iceBolt).toBeUndefined();
    // The unrelated rejection sticks until its own clear path fires.
    expect(next.learnSkillRejections.arcaneBlast).toBe('noSkillPoints');
  });
});
