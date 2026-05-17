import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { onLearnSkill } from '../server/players/playerSkills';
import { STARTER_SKILL_BY_CLASS, starterSkillsFor } from '../server/players/playerProgression';

function fakeOutbound() {
  return { publish: vi.fn() };
}

function captureDirect() {
  const sent: Array<{ type: string; [key: string]: unknown }> = [];
  return { direct: { send: (msg: { type: string; [key: string]: unknown }) => sent.push(msg) }, sent };
}

function setupMage() {
  const state = createGameState();
  const player = createTransientPlayer('socket-mage', 'Mageling');
  player.className = 'mage';
  state.players[player.id] = player;
  return { state, player };
}

describe('learn skill rejections', () => {
  test('emits LearnSkillFailed with levelTooLow when the requirement is unmet', () => {
    const { state, player } = setupMage();
    player.level = 1;
    player.availableSkillPoints = 1;
    const { direct, sent } = captureDirect();
    onLearnSkill({ id: player.socketId }, direct, fakeOutbound(), state, {
      type: 'LearnSkill',
      skillId: 'iceBolt', // requires level 3 for mage and fireball + waterSplash prereqs
    });
    const reject = sent.find((m) => m.type === 'LearnSkillFailed');
    expect(reject?.reason).toBe('levelTooLow');
  });

  test('emits LearnSkillFailed with missingPrereq when the player is high enough but lacks a prereq', () => {
    const { state, player } = setupMage();
    player.level = 5;
    player.availableSkillPoints = 1;
    player.unlockedSkills = []; // missing fireball
    const { direct, sent } = captureDirect();
    onLearnSkill({ id: player.socketId }, direct, fakeOutbound(), state, {
      type: 'LearnSkill',
      skillId: 'waterSplash', // requires fireball
    });
    const reject = sent.find((m) => m.type === 'LearnSkillFailed');
    expect(reject?.reason).toBe('missingPrereq');
  });

  test('emits LearnSkillFailed with noSkillPoints when the player is out of SP', () => {
    const { state, player } = setupMage();
    player.level = 10;
    player.availableSkillPoints = 0;
    player.unlockedSkills = ['fireball'];
    const { direct, sent } = captureDirect();
    onLearnSkill({ id: player.socketId }, direct, fakeOutbound(), state, {
      type: 'LearnSkill',
      skillId: 'waterSplash',
    });
    const reject = sent.find((m) => m.type === 'LearnSkillFailed');
    expect(reject?.reason).toBe('noSkillPoints');
  });

  test('STARTER_SKILL_BY_CLASS maps every class to a sensible starter', () => {
    expect(STARTER_SKILL_BY_CLASS.mage).toBe('fireball');
    expect(STARTER_SKILL_BY_CLASS.warrior).toBe('slash');
    expect(STARTER_SKILL_BY_CLASS.healer).toBe('holyLight');
    expect(STARTER_SKILL_BY_CLASS.ranger).toBe('arrowShot');
    expect(STARTER_SKILL_BY_CLASS.rogue).toBe('evade');
  });

  test('starterSkillsFor returns the class starter for known classes', () => {
    // Universal skills (Basic Attack) follow the class starter.
    expect(starterSkillsFor('warrior')).toEqual(['slash', 'basicAttack']);
    expect(starterSkillsFor('healer')).toEqual(['holyLight', 'basicAttack']);
    expect(starterSkillsFor('rogue')).toEqual(['evade', 'basicAttack']);
    // Unknown class falls back to the mage starter so the bar is never empty.
    expect(starterSkillsFor('made-up')).toEqual(['fireball', 'basicAttack']);
  });
});
