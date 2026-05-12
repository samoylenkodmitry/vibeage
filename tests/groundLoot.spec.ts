import { describe, expect, test, vi } from 'vitest';
import type { Server } from 'socket.io';
import { createGameState } from '../server/gameState';
import { tryGiveLoot } from '../server/loot/groundLoot';
import type { PlayerState } from '../shared/types';

const makePlayer = (): PlayerState => ({
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
  inventory: [{ itemId: 'healthPotion', quantity: 1 }],
  maxInventorySlots: 20,
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
        { itemId: 'healthPotion', quantity: 2 },
        { itemId: 'manaPotion', quantity: 1 },
      ],
    };

    expect(tryGiveLoot(state, io, 'player1', 'loot1')).toBe(true);
    expect(state.groundLoot.loot1).toBeUndefined();
    expect(state.players.player1.inventory).toEqual([
      { itemId: 'healthPotion', quantity: 3 },
      { itemId: 'manaPotion', quantity: 1 },
    ]);
    expect(io.emit).toHaveBeenCalledWith('msg', {
      type: 'LootPickup',
      lootId: 'loot1',
      playerId: 'player1',
    });
    expect(io.to).toHaveBeenCalledWith('socket1');
    expect(directEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'LootAcquired',
      items: expect.arrayContaining([{ itemId: 'manaPotion', quantity: 1 }]),
    }));
  });
});
