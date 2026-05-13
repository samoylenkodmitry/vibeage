import { describe, expect, it } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import {
  gameClientReducer,
  initialGameClientState,
} from '../apps/client/src/gameReducer';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

const basePlayer: PlayerEntity = {
  id: 'player-1',
  socketId: 'socket-1',
  name: 'Tester',
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 80,
  maxMana: 100,
  level: 1,
  experience: 20,
  experienceToNextLevel: 100,
  isAlive: true,
  unlockedSkills: ['fireball'],
  skillShortcuts: ['fireball', null, null, null],
  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  castingSkill: null,
  castingProgressMs: 0,
  statusEffects: [],
  inventory: [{ itemId: 'health_potion', quantity: 2 }],
  maxInventorySlots: 20,
};

describe('Vite game client reducer', () => {
  it('normalizes server game state inventory and ground loot', () => {
    const joined = gameClientReducer(initialGameClientState, { type: 'joined', playerId: 'player-1' });
    const state = gameClientReducer(joined, {
      type: 'gameState',
      state: {
        players: { 'player-1': basePlayer },
        enemies: {},
        groundLoot: {
          loot1: {
            position: { x: 4, z: 6 },
            items: [{ itemId: 'gold_coin', quantity: 3 }],
          },
        },
      },
    });

    expect(state.inventory).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
    expect(state.maxInventorySlots).toBe(20);
    expect(state.groundLoot.loot1.position).toEqual({ x: 4, y: 0.35, z: 6 });
  });

  it('tracks loot spawns and pickup removal', () => {
    const withLoot = gameClientReducer(initialGameClientState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'LootSpawn',
        enemyId: 'enemy-1',
        lootId: 'loot1',
        position: { x: 1, y: 0.2, z: 2 },
        loot: [{ itemId: 'gold_coin', quantity: 1 }],
      },
    });
    const withoutLoot = gameClientReducer(withLoot, {
      type: 'serverMessage',
      now: 200,
      message: { type: 'LootPickup', lootId: 'loot1', playerId: 'player-2' },
    });

    expect(withLoot.groundLoot.loot1.items).toEqual([{ itemId: 'gold_coin', quantity: 1 }]);
    expect(withoutLoot.groundLoot.loot1).toBeUndefined();
    expect(withoutLoot.combatLog[0].text).toContain('picked up loot');
  });

  it('updates inventory after item use', () => {
    const state = {
      ...initialGameClientState,
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      maxInventorySlots: 20,
    };
    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 1,
        healthDelta: 25,
      },
    });

    expect(nextState.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(nextState.combatLog[0].text).toContain('Health Potion');
    expect(nextState.combatLog[0].text).toContain('+25 HP');
  });
});

describe('Vite game client reducer visual events', () => {
  it('adds recovery visual events after local item use', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
    };

    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 1,
        healthDelta: 25,
        manaDelta: 10,
      },
    });

    expect(Object.values(nextState.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'healing',
      amount: 25,
      position: basePlayer.position,
    }));
    expect(Object.values(nextState.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'mana',
      amount: 10,
      position: basePlayer.position,
    }));
  });

  it('adds impact visual events for water splash and prunes old visual events', () => {
    const withImpact = gameClientReducer(initialGameClientState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CastSnapshot',
        data: {
          castId: 'cast-1',
          casterId: 'player-1',
          skillId: 'waterSplash',
          state: CastState.Impact,
          origin: { x: 0, z: 0 },
          pos: { x: 3, z: 4 },
          startedAt: 0,
          castTimeMs: 100,
          progressMs: 100,
        },
      },
    });
    const pruned = gameClientReducer(withImpact, { type: 'pruneCasts', now: 2_000 });

    expect(Object.values(withImpact.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'splash',
      radius: 3,
      position: { x: 3, y: 0.35, z: 4 },
    }));
    expect(Object.keys(pruned.visualEvents)).toHaveLength(0);
  });

  it('does not replace local inventory with another player inventory update', () => {
    const otherPlayer = { ...basePlayer, id: 'player-2', name: 'Other' };
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: {
        'player-1': basePlayer,
        'player-2': otherPlayer,
      },
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      maxInventorySlots: 20,
    };
    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'InventoryUpdate',
        playerId: 'player-2',
        inventory: [{ itemId: 'gold_coin', quantity: 9 }],
        maxInventorySlots: 30,
      },
    });

    expect(nextState.inventory).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
    expect(nextState.maxInventorySlots).toBe(20);
    expect(nextState.players['player-2'].inventory).toEqual([{ itemId: 'gold_coin', quantity: 9 }]);
    expect(nextState.players['player-2'].maxInventorySlots).toBe(30);
  });
});
