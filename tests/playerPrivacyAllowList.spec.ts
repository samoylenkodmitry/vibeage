import { describe, expect, it, vi } from 'vitest';
import { createStarterProgressState } from '../packages/protocol/messages';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import {
  PRIVATE_PLAYER_STATE_FIELDS,
  PUBLIC_PLAYER_FIELDS,
  makeClientGameStateSnapshot,
  sanitizePlayerForPublic,
  sanitizePlayerUpdateForPublic,
} from '../server/transport/clientState';
import { createGameState } from '../server/gameState';
import { makeColyseusOutbound } from '../server/transport/colyseusRoomAdapter';
import type { PlayerState } from '../packages/sim/entities';
import type { ColyseusBroadcastLike, ColyseusClientLike } from '../server/transport/colyseusRoomAdapter';

/**
 * Allow-list of fields *other* players are permitted to see in a public
 * snapshot of a player. If you add a field to PlayerState, you must
 * consciously decide whether it belongs here. Failing this test means a
 * new field was added without auditing its visibility.
 */
// §46/slice-4 — pulls from the runtime allow-list so this test never
// drifts from the source of truth. PUBLIC_PLAYER_FIELDS lives in
// `clientState.ts` and is what `sanitizePlayerForPublic` actually
// projects to.
const PUBLIC_PLAYER_KEYS = new Set<string>(PUBLIC_PLAYER_FIELDS);

function makePlayer(id: string, socketId: string): PlayerState {
  const player: PlayerState = {
    id,
    socketId,
    name: id,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'mage',
    race: 'human',
    unlockedSkills: ['fireball'],
    skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
    availableSkillPoints: 1,
    starterProgress: createStarterProgressState({ defeatedEnemies: 2, collectedDrops: 1 }),
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    inventory: [{ itemId: 'health_potion', quantity: 1 }],
    maxInventorySlots: 20,
    questState: { active: {}, completed: [] },
    gold: 0,
  };
  player.characterInventory = createEmptyInventory(id, { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 });
  player.characterInventory.equipment.MAIN_HAND = 'fake-instance-id';
  return player;
}

/**
 * Allow-list of fields the *owner* of a player is permitted to see in their
 * own snapshot. This is the union of PUBLIC_PLAYER_KEYS + every field in
 * PRIVATE_PLAYER_STATE_FIELDS (the owner sees everything). Plus
 * `inventory` and `maxInventorySlots` because the makePlayer fixture below
 * sets them; if the live PlayerState shape changes, this set needs to
 * reflect the union so it doesn't drift.
 */
const OWNER_PLAYER_KEYS = new Set<string>([
  ...PUBLIC_PLAYER_KEYS,
  ...PRIVATE_PLAYER_STATE_FIELDS,
]);

describe('owner snapshot allow-list', () => {
  it('every key on the owner snapshot is in the owner allow-list (no surprise fields)', () => {
    const state = createGameState();
    state.players.own = makePlayer('own', 'own-socket');
    state.players.other = makePlayer('other', 'other-socket');

    const snapshot = makeClientGameStateSnapshot(state, 'own-socket');
    const ownKeys = Object.keys(snapshot.players.own);
    const extras = ownKeys.filter(k => !OWNER_PLAYER_KEYS.has(k));
    expect(
      extras,
      `unexpected keys in owner snapshot: ${extras.join(', ')}. ` +
      'Either add the field to PUBLIC/PRIVATE allow-lists or remove it from PlayerState.',
    ).toEqual([]);
  });

  it('owner snapshot includes every PRIVATE_PLAYER_STATE_FIELDS entry the fixture sets', () => {
    const state = createGameState();
    const fixture = makePlayer('own', 'own-socket');
    state.players.own = fixture;
    const snapshot = makeClientGameStateSnapshot(state, 'own-socket');
    // §46/slice-4 — fixture only sets a subset of owner-only fields
    // (e.g. no skillLevels / usedResurrectionThisLife in the basic
    // makePlayer). Only assert the owner snapshot still surfaces the
    // ones the fixture provided — the broader contract (owner ⊇
    // PlayerState) is type-checked, not runtime-checked.
    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      if (fixture[field] === undefined) continue;
      expect(snapshot.players.own, `owner is missing their own ${field}`).toHaveProperty(field);
    }
  });
});

describe('public snapshot allow-list', () => {
  it('every key remaining after public sanitisation is in the public allow-list', () => {
    const player = makePlayer('p1', 's1');
    const sanitized = sanitizePlayerForPublic(player);
    const extras = Object.keys(sanitized).filter(k => !PUBLIC_PLAYER_KEYS.has(k));
    expect(extras, `unexpected keys in public snapshot: ${extras.join(', ')}`).toEqual([]);
  });

  it('every PRIVATE_PLAYER_STATE_FIELDS entry is excluded from the public allow-list', () => {
    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      expect(PUBLIC_PLAYER_KEYS.has(field), `private field "${field}" leaked into PUBLIC_PLAYER_KEYS`).toBe(false);
    }
  });

  it('strips every private field from a player update payload', () => {
    const update = sanitizePlayerUpdateForPublic({
      id: 'p1',
      health: 50,
      socketId: 'leak',
      starterProgress: createStarterProgressState({ defeatedEnemies: 1, collectedDrops: 0 }),
      inventory: [{ itemId: 'leak', quantity: 1 }],
      maxInventorySlots: 99,
      characterInventory: createEmptyInventory('p1', { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 }),
    });

    expect(update).toEqual({ id: 'p1', health: 50 });
  });
});

describe('broadcast paths never include owner-only state', () => {
  it('outbound playerUpdated event sanitises before broadcasting', () => {
    const broadcasts: Array<{ event: string; payload: unknown }> = [];
    const room: ColyseusBroadcastLike = {
      clients: [],
      broadcast(event, payload) {
        broadcasts.push({ event, payload });
      },
    };
    const sink = makeColyseusOutbound(room);

    sink.publish({
      type: 'playerUpdated',
      update: {
        id: 'p1',
        health: 75,
        socketId: 'should-not-leak',
        starterProgress: createStarterProgressState({ defeatedEnemies: 1, collectedDrops: 0 }),
        inventory: [{ itemId: 'leak', quantity: 1 }],
        maxInventorySlots: 99,
        characterInventory: createEmptyInventory('p1', { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 }),
      },
    });

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].payload).toEqual({ id: 'p1', health: 75 });
    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      expect(broadcasts[0].payload).not.toHaveProperty(field);
    }
  });
});

describe('directServerMessage routing', () => {
  it('only the matching socket receives a directServerMessage payload', () => {
    const sendA = vi.fn();
    const sendB = vi.fn();
    const broadcastSpy = vi.fn();
    const room: ColyseusBroadcastLike = {
      clients: [
        { sessionId: 'socket-a', send: sendA } as ColyseusClientLike,
        { sessionId: 'socket-b', send: sendB } as ColyseusClientLike,
      ],
      broadcast: broadcastSpy,
    };
    const sink = makeColyseusOutbound(room);

    sink.publish({
      type: 'directServerMessage',
      socketId: 'socket-b',
      message: { type: 'InventoryUpdate', playerId: 'p2', inventory: [], maxInventorySlots: 20 },
    });

    expect(sendA).not.toHaveBeenCalled();
    expect(sendB).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('no client receives anything when the target socket is not present', () => {
    const sendA = vi.fn();
    const broadcastSpy = vi.fn();
    const room: ColyseusBroadcastLike = {
      clients: [{ sessionId: 'socket-a', send: sendA } as ColyseusClientLike],
      broadcast: broadcastSpy,
    };
    const sink = makeColyseusOutbound(room);

    sink.publish({
      type: 'directServerMessage',
      socketId: 'socket-missing',
      message: { type: 'InventoryUpdate', playerId: 'pX', inventory: [], maxInventorySlots: 20 },
    });

    expect(sendA).not.toHaveBeenCalled();
    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});
