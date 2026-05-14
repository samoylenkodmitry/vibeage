import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  findPlayerIdBySocket,
  hydratePersistedPlayer,
  upsertActivePlayerSession,
} from '../server/players/playerSession';
import { buildStablePlayerPersistenceData } from '../server/persistence';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
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
      starter_progress: {
        defeatedEnemies: 2,
        defeatedEnemyIds: ['enemy-1', 'enemy-2'],
        lootPickups: 1,
        levelReached: 2,
        learnedSkills: 1,
        isComplete: false,
        rewardGranted: false,
      },
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
      starterProgress: {
        defeatedEnemies: 2,
        defeatedEnemyIds: ['enemy-1', 'enemy-2'],
        lootPickups: 1,
        levelReached: 3,
        learnedSkills: 1,
        isComplete: false,
        rewardGranted: false,
      },
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

describe('active player session replacement', () => {
  test('replaces an already active persisted player without leaving stale spatial entries', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const oldPlayer = makePlayer('player1', 'old-socket');
    oldPlayer.position = { x: 30, y: 0.5, z: 30 };
    const newPlayer = makePlayer('player1', 'new-socket');
    newPlayer.position = { x: -8, y: 0.5, z: 4 };

    upsertActivePlayerSession(state, spatial, oldPlayer);
    upsertActivePlayerSession(state, spatial, newPlayer);

    expect(state.players.player1.socketId).toBe('new-socket');
    expect(findPlayerIdBySocket(state, 'old-socket')).toBeUndefined();
    expect(spatial.queryCircle({ x: 30, z: 30 }, 1)).not.toContain('player1');
    expect(spatial.queryCircle({ x: -8, z: 4 }, 1)).toContain('player1');
  });
});

describe('player session relog persistence', () => {
  test('round-trips relog-critical progression state through persistence data', () => {
    const beforeRelog = makePlayer('player-db-id', 'old-socket');
    beforeRelog.position = { x: 12, y: 0.5, z: -4 };
    beforeRelog.health = 44;
    beforeRelog.level = 3;
    beforeRelog.experience = 80;
    beforeRelog.unlockedSkills = ['fireball', 'waterSplash'];
    beforeRelog.skillShortcuts = ['fireball', 'waterSplash', null, null, null, null, null, null, null];
    beforeRelog.availableSkillPoints = 1;
    beforeRelog.inventory = [
      { itemId: 'health_potion', quantity: 2 },
      { itemId: 'sprite_glow', quantity: 1 },
    ];

    const stable = buildStablePlayerPersistenceData(beforeRelog, 123);
    const afterRelog = hydratePersistedPlayer({
      id: beforeRelog.id,
      position_x: stable.position_x,
      position_y: stable.position_y,
      position_z: stable.position_z,
      health: stable.health,
      level: stable.level,
      experience: stable.experience,
      is_alive: stable.is_alive,
      class_name: stable.class_name,
      skills: JSON.parse(stable.skills),
      skill_shortcuts: JSON.parse(stable.skill_shortcuts),
      available_skill_points: stable.available_skill_points,
      starter_progress: stable.starter_progress,
      inventory: stable.inventory,
    }, 'new-socket', beforeRelog.name);

    expect(afterRelog).toMatchObject({
      id: beforeRelog.id,
      socketId: 'new-socket',
      position: beforeRelog.position,
      health: beforeRelog.health,
      level: beforeRelog.level,
      experience: beforeRelog.experience,
      unlockedSkills: beforeRelog.unlockedSkills,
      skillShortcuts: beforeRelog.skillShortcuts,
      availableSkillPoints: beforeRelog.availableSkillPoints,
      starterProgress: stable.starter_progress,
      inventory: beforeRelog.inventory,
    });
  });
});
