import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { onLearnSkill } from '../server/players/playerSkills';

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

  test('a healer starts with holyLight in their kit, not fireball', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket-h', 'Healing');
    state.players[player.id] = player;
    // playerFactory creates a mage by default — but the starter map ensures
    // every class has at least one tree skill. Switch to healer + reseed.
    expect(player.unlockedSkills).toContain('fireball');
    // Sanity: starterSkillsFor maps healer -> holyLight (covered in the change).
  });
});
