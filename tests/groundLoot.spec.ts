import { describe, expect, test, vi } from 'vitest';
import type { Server } from 'socket.io';
import { createGameState } from '../server/gameState';
import { tryGiveLoot } from '../server/loot/groundLoot';
import type { PlayerState } from '../shared/types';

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
    const directEmit = vi.fn();
    const io = {
      emit: vi.fn(),
      to: vi.fn(() => ({ emit: directEmit })),
    } as unknown as Server;

    state.players.player1 = makePlayer();
    state.groundLoot.loot1 = {
      position: { x: 1, z: 0 },
      items: [
        { itemId: 'health_potion', quantity: 2 },
        { itemId: 'gold_coin', quantity: 1 },
      ],
    };

    expect(tryGiveLoot(state, io, 'player1', 'loot1')).toBe(true);
    expect(state.groundLoot.loot1).toBeUndefined();
    expect(state.players.player1.inventory).toEqual([
      { itemId: 'health_potion', quantity: 3 },
      { itemId: 'gold_coin', quantity: 1 },
    ]);
    expect(io.emit).toHaveBeenCalledWith('msg', {
      type: 'LootPickup',
      lootId: 'loot1',
      playerId: 'player1',
    });
    expect(io.to).toHaveBeenCalledWith('socket1');
    expect(directEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'LootAcquired',
      items: expect.arrayContaining([{ itemId: 'gold_coin', quantity: 1 }]),
    }));
  });

  test('does not remove loot when inventory has no free slot for a new item', () => {
    const state = createGameState();
    const io = {
      emit: vi.fn(),
      to: vi.fn(() => ({ emit: vi.fn() })),
    } as unknown as Server;

    state.players.player1 = makePlayer({
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
      maxInventorySlots: 1,
    });
    state.groundLoot.loot1 = {
      position: { x: 1, z: 0 },
      items: [{ itemId: 'gold_coin', quantity: 5 }],
    };

    expect(tryGiveLoot(state, io, 'player1', 'loot1')).toBe(false);
    expect(state.groundLoot.loot1).toBeDefined();
    expect(state.players.player1.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(io.emit).not.toHaveBeenCalledWith('msg', expect.objectContaining({ type: 'LootPickup' }));
  });

  test('allows stacking existing inventory items even when slots are full', () => {
    const state = createGameState();
    const directEmit = vi.fn();
    const io = {
      emit: vi.fn(),
      to: vi.fn(() => ({ emit: directEmit })),
    } as unknown as Server;

    state.players.player1 = makePlayer({
      inventory: [{ itemId: 'health_potion', quantity: 1 }],
      maxInventorySlots: 1,
    });
    state.groundLoot.loot1 = {
      position: { x: 1, z: 0 },
      items: [{ itemId: 'health_potion', quantity: 2 }],
    };

    expect(tryGiveLoot(state, io, 'player1', 'loot1')).toBe(true);
    expect(state.groundLoot.loot1).toBeUndefined();
    expect(state.players.player1.inventory).toEqual([{ itemId: 'health_potion', quantity: 3 }]);
    expect(directEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'LootAcquired',
      items: [{ itemId: 'health_potion', quantity: 2 }],
    }));
  });
});
