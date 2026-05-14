import { describe, expect, test, vi } from 'vitest';
import type { SkillId } from '../packages/content/skills';
import { onLearnSkill } from '../server/skillHandler';
import { learnNewSkill } from '../server/skillManager';
import type { PlayerState } from '../shared/types';
import {
  normalizeAvailableSkillPoints,
  normalizeSkillShortcuts,
  normalizeUnlockedSkills,
} from '../server/players/playerProgression';

type TestPlayer = {
  id: string;
  socketId: string;
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
};

const starterShortcuts = (): (SkillId | null)[] => [
  'fireball',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

describe('player progression hydration', () => {
  test('gives a persisted player the starter skill when the database has an empty skills array', () => {
    const unlockedSkills = normalizeUnlockedSkills([]);
    const skillShortcuts = normalizeSkillShortcuts(['fireball', null], unlockedSkills);

    expect(unlockedSkills).toEqual(['fireball']);
    expect(skillShortcuts).toEqual(['fireball', null, null, null, null, null, null, null, null]);
  });

  test('drops shortcuts for skills that are not unlocked', () => {
    const unlockedSkills = normalizeUnlockedSkills(['fireball']);

    expect(normalizeSkillShortcuts(['iceBolt', 'fireball'], unlockedSkills)).toEqual([
      null,
      'fireball',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  test('normalizes persisted skill points', () => {
    expect(normalizeAvailableSkillPoints(0)).toBe(0);
    expect(normalizeAvailableSkillPoints('2')).toBe(2);
    expect(normalizeAvailableSkillPoints(null)).toBe(1);
  });
});

describe('skill learning state sync', () => {
  test('does not duplicate a skill that is already on the shortcut panel', () => {
    const player: TestPlayer = {
      id: 'player1',
      socketId: 'socket1',
      level: 1,
      className: 'mage',
      unlockedSkills: [],
      skillShortcuts: starterShortcuts(),
      availableSkillPoints: 1,
    };

    expect(learnNewSkill(player, 'fireball')).toBe(true);
    expect(player.unlockedSkills).toEqual(['fireball']);
    expect(player.skillShortcuts.filter(skillId => skillId === 'fireball')).toHaveLength(1);
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
      skillShortcuts: starterShortcuts(),
      availableSkillPoints: 1,
      skillCooldownEndTs: {},
      statusEffects: [],
      experience: 0,
      experienceToNextLevel: 100,
      castingSkill: null,
      castingProgressMs: 0,
      isAlive: true,
      inventory: [],
      maxInventorySlots: 20,
    };
    const socket = {
      id: 'socket1',
    };
    const direct = { send: vi.fn() };
    const outbound = { publish: vi.fn() };

    onLearnSkill(socket, direct, outbound, { players: { player1: player } }, {
      type: 'LearnSkill',
      skillId: 'fireball',
    });

    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'playerUpdated',
      update: {
        id: 'player1',
        unlockedSkills: ['fireball'],
        skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
        availableSkillPoints: 0,
      },
    });
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
