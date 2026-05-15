import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { applyDevTeleport, isDevCommandsEnabled } from '../server/movement/devTeleport';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';
import { WORLD_SETTINGS } from '../packages/content/world';

const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'TeleportTester',
  position: { x: 10, y: 0.5, z: 20 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: [],
  skillShortcuts: [null, null, null, null, null, null, null, null, null],
  availableSkillPoints: 0,
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

describe('isDevCommandsEnabled', () => {
  test('returns true only when VIBEAGE_ENABLE_DEV_COMMANDS is exactly "1"', () => {
    expect(isDevCommandsEnabled({ VIBEAGE_ENABLE_DEV_COMMANDS: '1' })).toBe(true);
    expect(isDevCommandsEnabled({ VIBEAGE_ENABLE_DEV_COMMANDS: 'true' })).toBe(false);
    expect(isDevCommandsEnabled({ VIBEAGE_ENABLE_DEV_COMMANDS: 'yes' })).toBe(false);
    expect(isDevCommandsEnabled({})).toBe(false);
  });
});

describe('applyDevTeleport', () => {
  const enabledEnv = { VIBEAGE_ENABLE_DEV_COMMANDS: '1' };
  const disabledEnv = {};

  test('rejects when dev commands are not enabled even with a valid socket and target', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const before = { ...state.players.player1.position };

    const result = applyDevTeleport(
      state,
      'socket1',
      { type: 'DevTeleport', id: 'player1', targetPos: { x: 100, z: -200 }, clientTs: 1 },
      1,
      disabledEnv,
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe('disabled');
    }
    expect(state.players.player1.position).toEqual(before);
  });

  test('rejects when the requesting socket does not own the player', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();

    const result = applyDevTeleport(
      state,
      'someoneElse',
      { type: 'DevTeleport', id: 'player1', targetPos: { x: 100, z: -200 }, clientTs: 1 },
      1,
      enabledEnv,
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe('socketMismatch');
    }
    expect(state.players.player1.position.x).toBe(10);
    expect(state.players.player1.position.z).toBe(20);
  });

  test('rejects targets outside the playable world radius', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const offWorld = WORLD_SETTINGS.playableRadius + 1;

    const result = applyDevTeleport(
      state,
      'socket1',
      { type: 'DevTeleport', id: 'player1', targetPos: { x: offWorld, z: 0 }, clientTs: 1 },
      1,
      enabledEnv,
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe('invalidTarget');
    }
  });

  test('moves the player to the target and stops any active movement', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    state.players.player1.movement = { isMoving: true, lastUpdateTime: 0, speed: 20 };
    state.players.player1.velocity = { x: 5, z: 5 };

    const result = applyDevTeleport(
      state,
      'socket1',
      { type: 'DevTeleport', id: 'player1', targetPos: { x: 4_321, z: -7_654 }, clientTs: 1 },
      1_700_000_000_000,
      enabledEnv,
    );

    expect(result.ok).toBe(true);
    expect(state.players.player1.position.x).toBe(4_321);
    expect(state.players.player1.position.z).toBe(-7_654);
    expect(state.players.player1.velocity).toEqual({ x: 0, z: 0 });
    expect(state.players.player1.movement?.isMoving).toBe(false);
    expect(state.players.player1.dirtySnap).toBe(true);
  });
});

describe('client message router DevTeleport gating', () => {
  test('drops DevTeleport silently when dev commands are not enabled', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const before = { ...state.players.player1.position };
    const socket = { id: 'socket1', emit: vi.fn() };
    const previousFlag = process.env.VIBEAGE_ENABLE_DEV_COMMANDS;
    delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS;

    try {
      handleClientMessage(
        socket,
        state,
        { type: 'DevTeleport', id: 'player1', targetPos: { x: 999, z: 999 }, clientTs: 1 },
        { publish: vi.fn() },
        new SpatialHashGrid(),
      );
    } finally {
      if (previousFlag !== undefined) {
        process.env.VIBEAGE_ENABLE_DEV_COMMANDS = previousFlag;
      }
    }

    expect(state.players.player1.position).toEqual(before);
  });

  test('teleports the player when dev commands are enabled', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const socket = { id: 'socket1', emit: vi.fn() };
    const previousFlag = process.env.VIBEAGE_ENABLE_DEV_COMMANDS;
    process.env.VIBEAGE_ENABLE_DEV_COMMANDS = '1';

    try {
      handleClientMessage(
        socket,
        state,
        { type: 'DevTeleport', id: 'player1', targetPos: { x: 555, z: -555 }, clientTs: 1 },
        { publish: vi.fn() },
        new SpatialHashGrid(),
      );
    } finally {
      if (previousFlag === undefined) {
        delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS;
      } else {
        process.env.VIBEAGE_ENABLE_DEV_COMMANDS = previousFlag;
      }
    }

    expect(state.players.player1.position.x).toBe(555);
    expect(state.players.player1.position.z).toBe(-555);
  });
});
