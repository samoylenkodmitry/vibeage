import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlayerState } from '../shared/types';

const dbMock = vi.hoisted(() => {
  const updateExecute = vi.fn();
  const updateWhere = vi.fn(() => ({ execute: updateExecute }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const updateTable = vi.fn(() => ({ set: updateSet }));

  const insertExecute = vi.fn();
  const executeTakeFirstOrThrow = vi.fn();
  const returningAll = vi.fn(() => ({ executeTakeFirstOrThrow }));
  const onConflict = vi.fn(() => ({ returningAll }));
  const insertValues = vi.fn(() => ({ onConflict, returningAll, execute: insertExecute }));
  const insertInto = vi.fn(() => ({ values: insertValues }));

  return {
    database: {
      updateTable,
      insertInto,
    },
    updateExecute,
    updateWhere,
    updateSet,
    updateTable,
    insertExecute,
    executeTakeFirstOrThrow,
    returningAll,
    onConflict,
    insertValues,
    insertInto,
  };
});

vi.mock('../server/db', () => ({
  database: dbMock.database,
}));

const {
  PERSISTED_PLAYER_COLUMNS,
  PLAYER_SESSION_COLUMNS,
  TRANSIENT_PLAYER_STATE_FIELDS,
  buildStablePlayerPersistenceData,
  persistPlayer,
  recordServerEvent,
  upsertPlayerSession,
} = await import('../server/persistence');

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'PersistedMage',
  position: { x: 4, y: 0.5, z: 8 },
  rotation: { x: 0, y: 1.4, z: 0 },
  health: 75,
  maxHealth: 140,
  mana: 22,
  maxMana: 120,
  className: 'mage',
  unlockedSkills: ['fireball', 'fireball', 'waterSplash'],
  skillShortcuts: ['waterSplash', 'petrify', 'fireball', null, null, null, null, null, null],
  availableSkillPoints: 2,
  skillCooldownEndTs: { fireball: 1234 },
  statusEffects: [{ id: 'burn1', type: 'burn', value: 1, durationMs: 5000, startTimeTs: 1000, sourceSkill: 'fireball' }],
  level: 3,
  experience: 120,
  experienceToNextLevel: 225,
  castingSkill: 'fireball',
  castingProgressMs: 100,
  isAlive: true,
  deathTimeTs: 999,
  targetId: 'enemy1',
  lastSnapTime: 111,
  movement: { isMoving: true, targetPos: { x: 10, z: 12 }, lastUpdateTime: 100, speed: 8 },
  velocity: { x: 1, z: 0 },
  posHistory: [{ ts: 100, x: 3, z: 7 }],
  stats: { dmgMult: 1.2 },
  inventory: [{ itemId: 'health_potion', quantity: 2 }],
  maxInventorySlots: 20,
  ...overrides,
});

describe('stable persistence contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VIBEAGE_DISABLE_PERSISTENCE;
    dbMock.updateExecute.mockResolvedValue([]);
    dbMock.insertExecute.mockResolvedValue(undefined);
    dbMock.executeTakeFirstOrThrow.mockResolvedValue({ id: 'player1', name: 'PersistedMage' });
  });

  test('serializes only stable player columns', () => {
    const persisted = buildStablePlayerPersistenceData(makePlayer(), 123456);

    expect(Object.keys(persisted).sort()).toEqual([...PERSISTED_PLAYER_COLUMNS].sort());
    expect(persisted).toMatchObject({
      position_x: 4,
      position_y: 0.5,
      position_z: 8,
      health: 75,
      is_alive: true,
      level: 3,
      experience: 120,
      class_name: 'mage',
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      skills: JSON.stringify(['fireball', 'waterSplash']),
      skill_shortcuts: JSON.stringify(['waterSplash', null, 'fireball', null, null, null, null, null, null]),
      available_skill_points: 2,
      starter_progress: {
        defeatedEnemies: 0,
        defeatedEnemyIds: [],
        lootPickups: 0,
        levelReached: 3,
        learnedSkills: 2,
        isComplete: false,
        rewardGranted: false,
      },
      last_updated: 123456,
    });

    for (const transientField of TRANSIENT_PLAYER_STATE_FIELDS) {
      expect(persisted).not.toHaveProperty(transientField);
    }
  });

  test('updates player rows by id through Kysely', async () => {
    await persistPlayer(makePlayer({ id: 'player-db-id' }));

    const updateSetCalls = dbMock.updateSet.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(dbMock.updateTable).toHaveBeenCalledWith('players');
    expect(dbMock.updateSet).toHaveBeenCalledTimes(1);
    expect(Object.keys(updateSetCalls[0][0]).sort()).toEqual([...PERSISTED_PLAYER_COLUMNS].sort());
    expect(dbMock.updateWhere).toHaveBeenCalledWith('id', '=', 'player-db-id');
    expect(dbMock.updateExecute).toHaveBeenCalledTimes(1);
  });

  test('upserts the session identity without transient player state', async () => {
    await upsertPlayerSession('socket1', 'PersistedMage');

    const insertValueCalls = dbMock.insertValues.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(dbMock.insertInto).toHaveBeenCalledWith('players');
    expect(Object.keys(insertValueCalls[0][0]).sort()).toEqual([...PLAYER_SESSION_COLUMNS].sort());
    expect(dbMock.onConflict).toHaveBeenCalledTimes(1);
    expect(dbMock.executeTakeFirstOrThrow).toHaveBeenCalledTimes(1);
  });

  test('records server events only when persistence is enabled', async () => {
    await recordServerEvent('player_login', 'player1', { playerName: 'PersistedMage' });

    const insertValueCalls = dbMock.insertValues.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(dbMock.insertInto).toHaveBeenCalledWith('server_events');
    expect(insertValueCalls[0][0]).toMatchObject({
      event_type: 'player_login',
      player_id: 'player1',
    });
    expect(dbMock.insertExecute).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    process.env.VIBEAGE_DISABLE_PERSISTENCE = '1';

    await recordServerEvent('player_disconnect', 'player1', {});

    expect(dbMock.insertInto).not.toHaveBeenCalled();
  });
});
