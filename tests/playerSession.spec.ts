import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  findPlayerIdBySocket,
  hydratePersistedPlayer,
  removePlayerSessionBySocketId,
  upsertActivePlayerSession,
} from '../server/players/playerSession';
import { buildStablePlayerPersistenceData } from '../server/persistence';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { CharacterInventory } from '../packages/sim/characterInventory';
import type { PlayerState } from '../packages/sim/entities';

// §45.7 — `players.inventory` column was dropped in migration 011;
// the persisted bag lives entirely in `players.character_inventory`.
// This helper builds a minimal aggregate carrying one template at a
// stated quantity so the legacy "row.inventory = [...]" test inputs
// can express the same intent in the new shape.
function aggregateWith(ownerId: string, templateId: string, quantity: number): CharacterInventory {
  return {
    characterId: ownerId,
    items: {
      [`inst-${templateId}`]: {
        instanceId: `inst-${templateId}`,
        ownerId,
        templateId,
        location: { kind: 'inventory', slotIndex: 0 },
        count: quantity,
        enchantLevel: 0,
        bound: false,
        createdAtTs: 0,
      },
    },
    equipment: {},
    occupancy: {},
    limits: { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 },
  };
}

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
      character_inventory: aggregateWith('db-player-id', 'health_potion', 1),
    }, 'socket1', 'PersistedMage');

    expect(player).toMatchObject({
      id: 'db-player-id',
      socketId: 'socket1',
      name: 'PersistedMage',
      position: { x: 4, y: 0.5, z: 8 },
      health: 75,
      level: 3,
      experience: 120,
      experienceToNextLevel: 225,
      // PR PP — auto-granted class passive (mage → passive_arcane_focus)
      // is included on hydrate so class HP/MP/dmg deltas land via the
      // Contribution registry.
      unlockedSkills: ['fireball', 'basicAttack', 'escape', 'passive_arcane_focus'],
      skillShortcuts: ['fireball', ...Array(23).fill(null)],
      availableSkillPoints: 2,
      starterProgress: {
        defeatedEnemies: 2,
        defeatedEnemyIds: ['enemy-1', 'enemy-2'],
        lootPickups: 1,
        levelReached: 3,
        // Class starter + basicAttack + escape + auto-granted class
        // passive — starterProgress counts every unlocked skill, and
        // the auto-passive is one of them post-PR-PP.
        learnedSkills: 4,
        isComplete: false,
        rewardGranted: false,
      },
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
    });
    expect(player.maxHealth).toBeGreaterThan(100);
    expect(player.maxMana).toBeGreaterThan(100);
    expect(player.stats?.dmgMult).toBeGreaterThan(0);
  });

  test('hydrates legacy xp and level-derived stats', () => {
    const player = hydratePersistedPlayer({
      id: 'legacy-player-id',
      health: 0,
      level: '2',
      xp: '80',
      is_alive: false,
      skills: ['fireball'],
    }, 'socket1', 'LegacyMage');

    expect(player).toMatchObject({
      health: 0,
      level: 2,
      experience: 80,
      experienceToNextLevel: 150,
      isAlive: false,
    });
    expect(player.maxHealth).toBeGreaterThan(100);
    expect(player.mana).toBe(player.maxMana);
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
  test('inserts a first active player into the spatial index', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = makePlayer('player1', 'socket1');
    player.position = { x: 11, y: 0.5, z: -3 };

    upsertActivePlayerSession(state, spatial, player);

    expect(state.players.player1).toBe(player);
    expect(spatial.queryCircle({ x: 11, z: -3 }, 1)).toContain('player1');
  });

  test('hands off an already active persisted player without losing live state', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const oldPlayer = makePlayer('player1', 'old-socket');
    oldPlayer.position = { x: 30, y: 0.5, z: 30 };
    oldPlayer.health = 42;
    oldPlayer.inventory = [{ itemId: 'health_potion', quantity: 1 }];
    const newPlayer = makePlayer('player1', 'new-socket');
    newPlayer.position = { x: -8, y: 0.5, z: 4 };
    newPlayer.health = 100;

    upsertActivePlayerSession(state, spatial, oldPlayer);
    const activePlayer = upsertActivePlayerSession(state, spatial, newPlayer);

    expect(activePlayer).toBe(oldPlayer);
    expect(state.players.player1.socketId).toBe('new-socket');
    expect(state.players.player1.health).toBe(42);
    expect(state.players.player1.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(findPlayerIdBySocket(state, 'old-socket')).toBeUndefined();
    expect(spatial.queryCircle({ x: 30, z: 30 }, 1)).toContain('player1');
    expect(spatial.queryCircle({ x: -8, z: 4 }, 1)).not.toContain('player1');
  });

  test('preserves death state during active-session handoff', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const oldPlayer = makePlayer('player1', 'old-socket');
    oldPlayer.isAlive = false;
    oldPlayer.health = 0;
    oldPlayer.deathTimeTs = 1234;
    const newPlayer = makePlayer('player1', 'new-socket');

    upsertActivePlayerSession(state, spatial, oldPlayer);
    const activePlayer = upsertActivePlayerSession(state, spatial, newPlayer);

    expect(activePlayer).toBe(oldPlayer);
    expect(activePlayer.socketId).toBe('new-socket');
    expect(activePlayer.isAlive).toBe(false);
    expect(activePlayer.health).toBe(0);
    expect(activePlayer.deathTimeTs).toBe(1234);
  });

  test('ignores stale socket leave after active-session handoff', async () => {
    const previousDisablePersistence = process.env.VIBEAGE_DISABLE_PERSISTENCE;
    process.env.VIBEAGE_DISABLE_PERSISTENCE = '1';
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const oldPlayer = makePlayer('player1', 'old-socket');
    const newPlayer = makePlayer('player1', 'new-socket');

    try {
      upsertActivePlayerSession(state, spatial, oldPlayer);
      upsertActivePlayerSession(state, spatial, newPlayer);

      await expect(removePlayerSessionBySocketId(state, spatial, 'old-socket')).resolves.toBeNull();
      expect(state.players.player1?.socketId).toBe('new-socket');
    } finally {
      if (previousDisablePersistence === undefined) {
        delete process.env.VIBEAGE_DISABLE_PERSISTENCE;
      } else {
        process.env.VIBEAGE_DISABLE_PERSISTENCE = previousDisablePersistence;
      }
    }
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
    beforeRelog.skillShortcuts = ['fireball', 'waterSplash', ...Array(22).fill(null)];
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
      skills: stable.skills,
      skill_shortcuts: stable.skill_shortcuts,
      available_skill_points: stable.available_skill_points,
      starter_progress: stable.starter_progress,
      character_inventory: stable.character_inventory,
    }, 'new-socket', beforeRelog.name);

    expect(afterRelog).toMatchObject({
      id: beforeRelog.id,
      socketId: 'new-socket',
      position: beforeRelog.position,
      health: beforeRelog.health,
      level: beforeRelog.level,
      experience: beforeRelog.experience,
      // PR PP — Universal skills (Basic Attack + Escape) + the
      // auto-granted class passive are appended on hydrate (back-
      // compat for saves written before either concept existed).
      // beforeRelog is a mage, so passive_arcane_focus is added.
      unlockedSkills: [...beforeRelog.unlockedSkills, 'basicAttack', 'escape', 'passive_arcane_focus'],
      skillShortcuts: beforeRelog.skillShortcuts,
      availableSkillPoints: beforeRelog.availableSkillPoints,
      starterProgress: stable.starter_progress,
      inventory: beforeRelog.inventory,
    });
  });
});
