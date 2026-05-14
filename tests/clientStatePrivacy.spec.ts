import { describe, expect, test } from 'vitest';
import { createStarterProgressState } from '../packages/protocol/messages';
import { createGameState } from '../server/gameState';
import {
  PRIVATE_PLAYER_STATE_FIELDS,
  makeClientGameStateSnapshot,
  sanitizePlayerForPublic,
  sanitizePlayerUpdateForPublic,
} from '../server/transport/clientState';
import type { PlayerState } from '../shared/types';

describe('client state privacy', () => {
  test('keeps owner-only player fields only on the requesting player snapshot', () => {
    const state = createGameState();
    state.players.own = makePlayer('own', 'own-socket');
    state.players.other = makePlayer('other', 'other-socket');

    const snapshot = makeClientGameStateSnapshot(state, 'own-socket');

    expect(snapshot.players.own).toHaveProperty('socketId', 'own-socket');
    expect(snapshot.players.own).toHaveProperty('starterProgress');
    expect(snapshot.players.own).toHaveProperty('inventory');
    expect(snapshot.players.own).toHaveProperty('maxInventorySlots', 20);
    expect(snapshot.players.other).toHaveProperty('id', 'other');

    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      expect(snapshot.players.other).not.toHaveProperty(field);
    }
  });

  test('strips private player fields from public broadcasts and update payloads', () => {
    const player = makePlayer('player1', 'socket1');

    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('socketId');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('starterProgress');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('inventory');
    expect(sanitizePlayerForPublic(player)).not.toHaveProperty('maxInventorySlots');

    const update = sanitizePlayerUpdateForPublic({
      id: player.id,
      health: 10,
      socketId: player.socketId,
      starterProgress: player.starterProgress,
      inventory: player.inventory,
      maxInventorySlots: player.maxInventorySlots,
    });

    expect(update).toEqual({ id: 'player1', health: 10 });
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
    inventory: [{ itemId: 'health_potion', quantity: 1 }],
    maxInventorySlots: 20,
  };
}
