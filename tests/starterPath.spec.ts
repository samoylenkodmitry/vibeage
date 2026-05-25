import { describe, expect, test } from 'vitest';
import { createStarterProgressState } from '../packages/protocol/messages';
import {
  recordStarterEnemyDefeat,
  recordStarterLootPickup,
  syncPlayerStarterProgress,
} from '../server/progression/starterPath';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'Starter',
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],

  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  maxInventorySlots: 20,
  starterProgress: createStarterProgressState({ learnedSkills: 1 }),
  ...overrides,
});

describe('server starter path progression', () => {
  test('tracks enemy defeats once per enemy id', () => {
    const player = makePlayer();

    recordStarterEnemyDefeat(player, 'enemy-1');
    recordStarterEnemyDefeat(player, 'enemy-1');
    recordStarterEnemyDefeat(player, 'enemy-2');

    expect(player.starterProgress?.defeatedEnemies).toBe(2);
    expect(player.starterProgress?.defeatedEnemyIds).toEqual(['enemy-1', 'enemy-2']);
  });

  test('grants the starter reward exactly once when goals are complete', () => {
    const player = makePlayer({
      level: 2,
      starterProgress: createStarterProgressState({
        defeatedEnemies: 3,
        defeatedEnemyIds: ['enemy-1', 'enemy-2', 'enemy-3'],
        lootPickups: 2,
        levelReached: 2,
        learnedSkills: 1,
      }),
    });

    const first = recordStarterLootPickup(player, 1);
    const second = syncPlayerStarterProgress(player);

    expect(first.rewardGranted).toBe(true);
    expect(second.rewardGranted).toBe(false);
    expect(player.availableSkillPoints).toBe(1);
    expect(player.starterProgress).toMatchObject({
      isComplete: true,
      rewardGranted: true,
      lootPickups: 3,
    });
  });
});
