import { describe, expect, test } from 'vitest';
import { createStarterProgressState } from '../packages/protocol/messages';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import { createGameState } from '../server/gameState';
import {
  CLIENT_GAME_STATE_FIELDS,
  PRIVATE_PLAYER_STATE_FIELDS,
  makeClientGameStateSnapshot,
  sanitizePlayerForPublic,
  sanitizePlayerUpdateForPublic,
} from '../server/transport/clientState';
import type { PlayerState } from '../packages/sim/entities';

describe('client state privacy', () => {
  test('keeps owner-only player fields only on the requesting player snapshot', () => {
    const state = createGameState();
    state.players.own = makePlayer('own', 'own-socket');
    state.players.other = makePlayer('other', 'other-socket');

    const snapshot = makeClientGameStateSnapshot(state, 'own-socket');

    // §52 #3 — owner snapshot is now an `OwnerPlayerSnapshot` projection.
    // Server-only bookkeeping (socketId, characterInventory, posHistory,
    // lastRegenTimeMs) stays out even from the owner; the owner-only
    // bag/equipment data ships via its dedicated wire messages.
    expect(snapshot.players.own).not.toHaveProperty('socketId');
    expect(snapshot.players.own).toHaveProperty('starterProgress');
    expect(snapshot.players.own).not.toHaveProperty('inventory');
    expect(snapshot.players.own).not.toHaveProperty('characterInventory');
    expect(snapshot.players.own).toHaveProperty('maxInventorySlots', 20);
    expect(snapshot.players.other).toHaveProperty('id', 'other');

    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      expect(snapshot.players.other).not.toHaveProperty(field);
    }
    // Belt-and-suspenders: characterInventory was the recent leak and
    // shouldn't ride along even if the field list is edited carelessly.
    expect(snapshot.players.other).not.toHaveProperty('characterInventory');
    expect(Object.keys(snapshot).sort()).toEqual([...CLIENT_GAME_STATE_FIELDS].sort());
    expect(snapshot).not.toHaveProperty('activeCasts');
    expect(snapshot).not.toHaveProperty('projectiles');
    expect(snapshot).not.toHaveProperty('lastProjectileId');
  });

  test('strips private player fields from public broadcasts and update payloads', () => {
    const player = makePlayer('player1', 'socket1');

    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('socketId');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('starterProgress');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('inventory');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('maxInventorySlots');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('characterInventory');

    // §52 #2 — `PlayerState.inventory` retired; the wire-only
    // `PlayerUpdate.inventory` projection still exists, so this test
    // still asserts the sanitiser scrubs it.
    const update = sanitizePlayerUpdateForPublic({
      id: player.id,
      health: 10,
      socketId: player.socketId,
      starterProgress: player.starterProgress,
      maxInventorySlots: player.maxInventorySlots,
      characterInventory: player.characterInventory,
    });

    expect(update).toEqual({ id: 'player1', health: 10 });
  });

  test('public sanitiser drops the full characterInventory aggregate', () => {
    const player = makePlayer('player1', 'socket1');
    player.characterInventory = createEmptyInventory(player.id, { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 });
    player.characterInventory.equipment.MAIN_HAND = 'fake-item-id';
    const publicView = sanitizePlayerForPublic(player);
    expect(publicView).not.toHaveProperty('characterInventory');
    // The original player still has it — we mutated a copy, not the source.
    expect(player.characterInventory).toBeDefined();
  });
});

function makePlayer(id: string, socketId: string): PlayerState {
  return {
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
    maxInventorySlots: 20,
  };
}
