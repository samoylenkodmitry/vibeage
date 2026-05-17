import { describe, expect, test, vi } from 'vitest';
import type { SkillId } from '../packages/content/skills';
import { learnNewSkill, onLearnSkill } from '../server/players/playerSkills';
import type { PlayerState } from '../packages/sim/entities';
import { createGameState } from '../server/gameState';
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

    // Class starter (fireball — defaults to mage) plus the universal
    // Basic Attack are unconditionally restored on hydrate.
    expect(unlockedSkills).toEqual(['fireball', 'basicAttack']);
    expect(skillShortcuts.length).toBe(24);
    expect(skillShortcuts[0]).toBe('fireball');
    expect(skillShortcuts.slice(1)).toEqual(Array(23).fill(null));
  });

  test('drops shortcuts for unknown skill ids', () => {
    const unlockedSkills = normalizeUnlockedSkills(['fireball']);
    const result = normalizeSkillShortcuts(['mysticBlast', 'fireball'], unlockedSkills);
    expect(result.length).toBe(24);
    expect(result[0]).toBeNull();
    expect(result[1]).toBe('fireball');
    expect(result.slice(2)).toEqual(Array(22).fill(null));
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
