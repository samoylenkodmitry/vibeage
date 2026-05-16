import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import { pickupGroundLoot } from '../server/loot/lootPickup';
import { createTransientPlayer } from '../server/playerFactory';

function withTinyBag() {
  const state = createGameState();
  const player = createTransientPlayer('socket-1', 'TightBag');
  // Clear the starter loadout, then force a one-slot bag so a 2-item drop has
  // to partially fail and must roll back atomically.
  player.inventory = [];
  if (player.characterInventory) {
    player.characterInventory.items = {};
    player.characterInventory.equipment = {};
    player.characterInventory.occupancy = {};
    player.characterInventory.limits = { ...player.characterInventory.limits, baseSlots: 1 };
  }
  player.maxInventorySlots = 1;
  state.players[player.id] = player;
  return { state, player };
}

describe('loot pickup atomicity', () => {
  test('partial inventory failure rolls back instead of duping items', () => {
    const { state, player } = withTinyBag();
    const lootId = 'loot-test-1';
    state.groundLoot[lootId] = {
      position: { x: player.position.x, z: player.position.z },
      items: [
        { itemId: 'worn_sword', quantity: 1 },
        { itemId: 'flame_blade', quantity: 1 },
      ],
    };

    const result = pickupGroundLoot(state, player.id, lootId);

    expect(result).toEqual({ ok: false, reason: 'inventoryFull' });
    // Bag must be empty (no partial add survives), loot must still be on the ground.
    expect(player.inventory).toEqual([]);
    expect(state.groundLoot[lootId]).toBeDefined();
  });
});
