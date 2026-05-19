import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { tryGiveLoot } from '../server/loot/groundLoot';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'Looter',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: [],
  skillShortcuts: [],
  availableSkillPoints: 0,
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
  ...overrides,
});

describe('ground loot', () => {
  test('gives nearby loot to player inventory and emits pickup messages', () => {
    const state = createGameState();
    const outbound = { publish: vi.fn() };

    state.players.player1 = makePlayer();
    state.groundLoot.loot1 = {
      position: { x: 1, z: 0 },
      items: [
        { itemId: 'health_potion', quantity: 2 },
        { itemId: 'gold_coin', quantity: 1 },
      ],
    };

    expect(tryGiveLoot(state, outbound, 'player1', 'loot1')).toBe(true);
    expect(state.groundLoot.loot1).toBeUndefined();
    // PR GG — gold_coin auto-converts to the gold counter on pickup
    // instead of taking a bag slot. The bag only carries the other
    // drop; the player's `gold` reflects the coin drop.
    expect(state.players.player1.inventory).toEqual([
      { itemId: 'health_potion', quantity: 3 },
    ]);
    expect(state.players.player1.gold).toBe(1);
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'serverMessage',
      message: {
        type: 'LootPickup',
        lootId: 'loot1',
        playerId: 'player1',
      },
    });
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'directServerMessage',
      socketId: 'socket1',
      message: expect.objectContaining({
        type: 'LootAcquired',
        items: expect.arrayContaining([{ itemId: 'gold_coin', quantity: 1 }]),
      }),
    });
  });

  test('does not remove loot when inventory has no free slot for a new item', () => {
    const state = createGameState();
    const outbound = { publish: vi.fn() };

    state.players.player1 = makePlayer({
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
      maxInventorySlots: 1,
    });
    state.groundLoot.loot1 = {
      position: { x: 1, z: 0 },
      // PR GG — pickup must still fail when the *bag* item can't fit.
      // gold_coin would bypass slot pressure, so use a real bag item
      // here to exercise the inventory-full guard.
      items: [{ itemId: 'wolf_pelt', quantity: 1 }],
    };

    expect(tryGiveLoot(state, outbound, 'player1', 'loot1')).toBe(false);
    expect(state.groundLoot.loot1).toBeDefined();
    expect(state.players.player1.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(outbound.publish).not.toHaveBeenCalled();
  });

  test('allows stacking existing inventory items even when slots are full', () => {
    const state = createGameState();
    const outbound = { publish: vi.fn() };

    state.players.player1 = makePlayer({
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
      maxInventorySlots: 1,
    });
    state.groundLoot.loot1 = {
      position: { x: 1, z: 0 },
      items: [{ itemId: 'health_potion', quantity: 2 }],
    };

    expect(tryGiveLoot(state, outbound, 'player1', 'loot1')).toBe(true);
    expect(state.groundLoot.loot1).toBeUndefined();
    expect(state.players.player1.inventory).toEqual([{ itemId: 'health_potion', quantity: 3 }]);
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'directServerMessage',
      socketId: 'socket1',
      message: expect.objectContaining({
        type: 'LootAcquired',
        items: [{ itemId: 'health_potion', quantity: 2 }],
      }),
    });
  });
});
