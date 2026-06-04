import { describe, expect, test, vi } from 'vitest';
import type { SkillId } from '../packages/content/skills';
import { ENEMY_BASE_SCALING } from '../packages/content/enemies';
import { learnNewSkill, onLearnSkill } from '../server/players/playerSkills';
import type { PlayerState } from '../packages/sim/entities';
import { createGameState } from '../server/gameState';
import {
  getExperienceToNextLevel,
  normalizeAvailableSkillPoints,
  normalizeUnlockedSkills,
} from '../server/players/playerProgression';

type TestPlayer = {
  id: string;
  socketId: string;
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  availableSkillPoints: number;
};

describe('player progression hydration', () => {
  test('keeps the non-exponential curve within the one-day level-40 simulator target band', () => {
    const totalXpToLevel40 = Array.from({ length: 39 }, (_, index) => getExperienceToNextLevel(index + 1))
      .reduce((total, xp) => total + xp, 0);

    expect(getExperienceToNextLevel(1)).toBe(100);
    expect(getExperienceToNextLevel(2)).toBe(160);
    expect(totalXpToLevel40).toBeGreaterThanOrEqual(170_000);
    expect(totalXpToLevel40).toBeLessThanOrEqual(185_000);
  });

  test('prevents one ordinary mob kill from skipping the next level', () => {
    for (let level = 1; level < 60; level += 1) {
      const ordinaryMobXp = ENEMY_BASE_SCALING.experience.flat + (ENEMY_BASE_SCALING.experience.perLevel * level);
      expect(getExperienceToNextLevel(level + 1), `level ${level} ordinary mob xp ${ordinaryMobXp}`).toBeGreaterThan(ordinaryMobXp);
    }
  });

  test('gives a persisted player the starter skill when the database has an empty skills array', () => {
    const unlockedSkills = normalizeUnlockedSkills([]);

    // Class starter (fireball — defaults to mage) plus the universal
    // Basic Attack + Escape are unconditionally restored on hydrate.
    expect(unlockedSkills).toEqual(['fireball', 'basicAttack', 'escape']);
  });

  test('normalizes persisted skill points', () => {
    expect(normalizeAvailableSkillPoints(0)).toBe(0);
    expect(normalizeAvailableSkillPoints('2')).toBe(2);
    expect(normalizeAvailableSkillPoints(null)).toBe(1);
  });
});

describe('skill learning state sync', () => {
  test('learns a skill into unlockedSkills exactly once', () => {
    const player: TestPlayer = {
      id: 'player1',
      socketId: 'socket1',
      level: 1,
      className: 'mage',
      unlockedSkills: [],
      availableSkillPoints: 1,
    };

    expect(learnNewSkill(player, 'fireball')).toBe(true);
    expect(player.unlockedSkills).toEqual(['fireball']);
    expect(learnNewSkill(player, 'fireball')).toBe(true);
    expect(player.unlockedSkills.filter((s) => s === 'fireball')).toHaveLength(1);
  });

  test('sends the learning player a full skill update after learning a skill', () => {
    const player: PlayerState = {
      id: 'player1',
      socketId: 'socket1',
      name: 'Tester',
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      mana: 100,
      maxMana: 100,
      level: 1,
      className: 'mage',
      unlockedSkills: [],

      availableSkillPoints: 1,
      skillCooldownEndTs: {},
      statusEffects: [],
      experience: 0,
      experienceToNextLevel: 100,
      castingSkill: null,
      castingProgressMs: 0,
      isAlive: true,
      maxInventorySlots: 20,
    };
    const state = createGameState();
    state.players[player.id] = player;
    const socket = {
      id: 'socket1',
    };
    const direct = { send: vi.fn() };
    const outbound = { publish: vi.fn() };

    onLearnSkill(socket, direct, outbound, state, {
      type: 'LearnSkill',
      skillId: 'fireball',
    });

    // PR QQ — learning a skill now also broadcasts the recomputed
    // stats / vitals so a passive contribution lands client-side
    // immediately. Use objectContaining so the test doesn't pin
    // every numeric stat field.
    expect(outbound.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'playerUpdated',
      update: expect.objectContaining({
        id: 'player1',
        unlockedSkills: ['fireball'],
        availableSkillPoints: 0,
      }),
    }));
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'directServerMessage',
      socketId: 'socket1',
      message: expect.objectContaining({
        type: 'StarterProgressUpdate',
        progress: expect.objectContaining({ learnedSkills: 1 }),
      }),
    });
  });
});
