import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';

/**
 * §52 #1 + polish — client reducer routes `CommandRejected{commandType:'LearnSkill'|'UpgradeSkill',
 * targetId:<skillId>}` into `state.learnSkillRejections[skillId]`. Pre-§52
 * the same panel state was populated from the legacy `LearnSkillFailed`
 * message which carried `skillId` as a top-level field; after retirement
 * the envelope's `targetId` carries the same id, and Upgrade shares
 * the slot.
 *
 * A successful `SkillLearned` for the same skill must clear the
 * rejection — otherwise the "you can't learn this" chip would stick
 * on the panel after the player gained the level / prereq.
 */

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

describe('gameClientReducer — LearnSkill rejection state', () => {
  it('stores the rejection reason under targetId for a LearnSkill CommandRejected', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'LearnSkill', reason: 'levelTooLow', targetId: 'iceBolt', requestId: 1 },
    });
    expect(next.learnSkillRejections.iceBolt).toBe('levelTooLow');
  });

  it('preserves prior rejections for other skills when a new one comes in', () => {
    const seeded = { ...baseState, learnSkillRejections: { iceBolt: 'levelTooLow' } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'LearnSkill', reason: 'noSkillPoints', targetId: 'arcaneBlast' },
    });
    expect(next.learnSkillRejections.iceBolt).toBe('levelTooLow');
    expect(next.learnSkillRejections.arcaneBlast).toBe('noSkillPoints');
  });

  it('ignores LearnSkill rejections that arrive without a targetId (defensive)', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'LearnSkill', reason: 'noSkillPoints' },
    });
    expect(next.learnSkillRejections).toEqual({});
  });

  it('does not touch learnSkillRejections for unrelated CommandRejected commandTypes', () => {
    const seeded = { ...baseState, learnSkillRejections: { iceBolt: 'levelTooLow' } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'CastReq', reason: 'cooldown' },
    });
    expect(next.learnSkillRejections).toEqual({ iceBolt: 'levelTooLow' });
  });
});

describe('gameClientReducer — UpgradeSkill rejection shares chip slot', () => {
  it('stores UpgradeSkill rejections on the same state slot (shared chip with LearnSkill)', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'UpgradeSkill', reason: 'maxRank', targetId: 'fireball' },
    });
    expect(next.learnSkillRejections.fireball).toBe('maxRank');
  });

  it('ignores UpgradeSkill rejections without a targetId', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'UpgradeSkill', reason: 'maxRank' },
    });
    expect(next.learnSkillRejections).toEqual({});
  });
});

describe('gameClientReducer — sticky-chip regression net', () => {
  it('clears the rejection for a skill once SkillLearned arrives', () => {
    const seeded = { ...baseState, learnSkillRejections: { iceBolt: 'levelTooLow', arcaneBlast: 'noSkillPoints' } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 200,
      message: { type: 'SkillLearned', skillId: 'iceBolt', remainingPoints: 0 },
    });
    expect(next.learnSkillRejections.iceBolt).toBeUndefined();
    expect(next.learnSkillRejections.arcaneBlast).toBe('noSkillPoints');
  });
});
