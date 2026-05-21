import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import { useItemForPlayer } from '../server/inventory/itemUse';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import type { PlayerState } from '../packages/sim/entities';
import { playerInventorySlots } from './helpers/inventoryView';

type PlayerOverrides = Partial<PlayerState> & { seedInventory?: ReadonlyArray<{ itemId: string; quantity: number }> };

const makePlayer = (overrides: PlayerOverrides = {}): PlayerState => {
  const { seedInventory, ...rest } = overrides;
  const player: PlayerState = {
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
    inventory: [],
    maxInventorySlots: 20,
    ...rest,
  };
  // §52/PR-queue-#2 — seed `characterInventory` (the source of truth)
  // rather than the now-deprecated `inventory` mirror. Default to a
  // pair of health potions to match the legacy fixture; tests pass
  // `seedInventory: [...]` to override.
  const seed = seedInventory ?? [{ itemId: 'health_potion', quantity: 2 }];
  for (const entry of seed) addItemsToPlayer(player, entry.itemId, entry.quantity);
  return player;
};

describe('item use', () => {
  test('uses a health potion and returns client update payloads', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result.ok).toBe(true);
    expect(state.players.player1.health).toBe(90);
    expect(playerInventorySlots(state.players.player1)[0].quantity).toBe(1);
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
      seedInventory: [{ itemId: 'mana_potion', quantity: 1 }],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result.ok).toBe(true);
    expect(state.players.player1.mana).toBe(100);
    expect(playerInventorySlots(state.players.player1)).toEqual([]);
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
      seedInventory: [
        { itemId: 'mana_potion', quantity: 1 },
        { itemId: 'health_potion', quantity: 1 },
      ],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result.ok).toBe(true);
    expect(playerInventorySlots(state.players.player1)).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(result).toEqual(expect.objectContaining({
      itemUsed: expect.objectContaining({
        slotIndex: 0,
        itemId: 'mana_potion',
        newQuantity: 0,
      }),
    }));
  });
});

describe('item use rejection', () => {
  test('rejects item use for dead players without changing inventory', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({ isAlive: false });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result).toEqual({ ok: false, reason: 'playerDead' });
    expect(state.players.player1.health).toBe(40);
    expect(playerInventorySlots(state.players.player1)[0].quantity).toBe(2);
  });

  test('rejects non-consumable inventory items', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({
      seedInventory: [{ itemId: 'worn_sword', quantity: 1 }],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result).toEqual({ ok: false, reason: 'notConsumable' });
    expect(playerInventorySlots(state.players.player1)[0].quantity).toBe(1);
  });

  test('rejects unsupported consumables without changing inventory', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({
      seedInventory: [{ itemId: 'teleport_scroll', quantity: 1 }],
    });

    const result = useItemForPlayer(state, 'player1', 0);

    expect(result).toEqual({ ok: false, reason: 'notConsumable' });
    expect(playerInventorySlots(state.players.player1)[0].quantity).toBe(1);
  });
});
