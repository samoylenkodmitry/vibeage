import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import { useItemForPlayer } from '../server/inventory/itemUse';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'PotionTester',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 40,
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
  inventory: [{ itemId: 'health_potion', quantity: 2 }],
  maxInventorySlots: 20,
  ...overrides,
});

describe('item use', () => {
  test('uses a health potion and returns client update payloads', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result.ok).toBe(true);
    expect(state.players.player1.health).toBe(90);
    expect(state.players.player1.inventory[0].quantity).toBe(1);
    expect(result).toEqual({
      ok: true,
      playerUpdated: { id: 'player1', health: 90 },
      itemUsed: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 1,
        healthDelta: 50,
        manaDelta: undefined,
      },
    });
  });

  test('uses a mana potion and returns only the mana update payload', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({
      mana: 20,
      inventory: [{ itemId: 'mana_potion', quantity: 1 }],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result.ok).toBe(true);
    expect(state.players.player1.mana).toBe(100);
    expect(state.players.player1.inventory).toEqual([]);
    expect(result).toEqual({
      ok: true,
      playerUpdated: { id: 'player1', mana: 100 },
      itemUsed: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'mana_potion',
        newQuantity: 0,
        healthDelta: undefined,
        manaDelta: 80,
      },
    });
  });

  test('compacts inventory slots after consuming the first slot', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({
      mana: 20,
      inventory: [
        { itemId: 'mana_potion', quantity: 1 },
        { itemId: 'health_potion', quantity: 1 },
      ],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result.ok).toBe(true);
    expect(state.players.player1.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(result).toEqual(expect.objectContaining({
      itemUsed: expect.objectContaining({
        slotIndex: 0,
        itemId: 'mana_potion',
        newQuantity: 0,
      }),
    }));
  });

  test('rejects item use for dead players without changing inventory', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({ isAlive: false });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result).toEqual({ ok: false, reason: 'playerDead' });
    expect(state.players.player1.health).toBe(40);
    expect(state.players.player1.inventory[0].quantity).toBe(2);
  });

  test('rejects non-consumable inventory items', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({
      inventory: [{ itemId: 'worn_sword', quantity: 1 }],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result).toEqual({ ok: false, reason: 'notConsumable' });
    expect(state.players.player1.inventory[0].quantity).toBe(1);
  });

  test('rejects unsupported consumables without changing inventory', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({
      inventory: [{ itemId: 'teleport_scroll', quantity: 1 }],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result).toEqual({ ok: false, reason: 'notConsumable' });
    expect(state.players.player1.inventory[0].quantity).toBe(1);
  });
});
