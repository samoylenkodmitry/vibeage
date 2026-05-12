import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import { findPlayerIdBySocket, hydratePersistedPlayer } from '../server/players/playerSession';
import type { PlayerState } from '../shared/types';

const makePlayer = (id: string, socketId: string): PlayerState => ({
  id,
  socketId,
  name: id,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],
  skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
  availableSkillPoints: 1,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  inventory: [],
  maxInventorySlots: 20,
});

describe('player session hydration', () => {
  test('hydrates persisted rows with normalized skill and inventory state', () => {
    const player = hydratePersistedPlayer({
      id: 'db-player-id',
      position_x: 4,
      position_y: 0.5,
      position_z: 8,
      health: 75,
      level: 3,
      experience: 120,
      is_alive: true,
      class_name: 'mage',
      skills: [],
      skill_shortcuts: ['fireball'],
      available_skill_points: 2,
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
    }, 'socket1', 'PersistedMage');

    expect(player).toMatchObject({
      id: 'db-player-id',
      socketId: 'socket1',
      name: 'PersistedMage',
      position: { x: 4, y: 0.5, z: 8 },
      health: 75,
      maxHealth: 140,
      mana: 120,
      maxMana: 120,
      level: 3,
      experience: 120,
      experienceToNextLevel: 225,
      unlockedSkills: ['fireball'],
      skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
      availableSkillPoints: 2,
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
    });
  });

  test('hydrates legacy xp and level-derived stats', () => {
    const player = hydratePersistedPlayer({
      id: 'legacy-player-id',
      health: 0,
      level: '2',
      xp: '80',
      is_alive: false,
      skills: ['fireball'],
      inventory: [],
    }, 'socket1', 'LegacyMage');

    expect(player).toMatchObject({
      health: 0,
      maxHealth: 120,
      mana: 110,
      maxMana: 110,
      level: 2,
      experience: 80,
      experienceToNextLevel: 150,
      isAlive: false,
    });
  });

  test('finds active players by socket id', () => {
    const state = createGameState();
    state.players.player1 = makePlayer('player1', 'socket1');
    state.players.player2 = makePlayer('player2', 'socket2');

    expect(findPlayerIdBySocket(state, 'socket2')).toBe('player2');
    expect(findPlayerIdBySocket(state, 'missing')).toBeUndefined();
  });
});
