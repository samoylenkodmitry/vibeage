import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import { pickupGroundLoot } from '../server/loot/lootPickup';
import { createTransientPlayer } from '../server/playerFactory';
import { playerInventorySlots } from './helpers/inventoryView';

/**
 * Anti-dupe contract for `pickupGroundLoot`.
 *
 * §52 follow-up: pickup used to be all-or-nothing — any single drop
 * that couldn't fit rolled the whole transaction back. The behaviour
 * changed to PARTIAL pickup (what fits goes to the bag, what
 * doesn't stays on the ground) so a wyvern's 4-item drop on a
 * 19/20 bag doesn't lock the player out of all of it.
 *
 * The dupe guard still has to hold: items that succeeded must be
 * REMOVED from the pile's `items` list. The remainder stays as the
 * authoritative truth for what's still on the ground.
 */
function withTinyBag() {
  const state = createGameState();
  const player = createTransientPlayer('socket-1', 'TightBag');
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
  test('partial pickup takes what fits and leaves the rest on the pile (no dupe)', () => {
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

    expect(result.ok).toBe(true);
    expect(playerInventorySlots(player).length).toBe(1);
    expect(state.groundLoot[lootId]).toBeDefined();
    expect(state.groundLoot[lootId].items.length).toBe(1);

    // Picking up again must NOT re-add the item already taken.
    const second = pickupGroundLoot(state, player.id, lootId);
    expect(second).toMatchObject({ ok: false, reason: 'inventoryFull' });
    expect(playerInventorySlots(player).length).toBe(1);
  });

  test('all-fail (no room) leaves the pile intact and reports inventoryFull', () => {
    const { state, player } = withTinyBag();
    state.groundLoot['seed'] = {
      position: { x: player.position.x, z: player.position.z },
      items: [{ itemId: 'worn_sword', quantity: 1 }],
    };
    pickupGroundLoot(state, player.id, 'seed');

    const lootId = 'loot-fail';
    state.groundLoot[lootId] = {
      position: { x: player.position.x, z: player.position.z },
      items: [{ itemId: 'flame_blade', quantity: 1 }],
    };
    const result = pickupGroundLoot(state, player.id, lootId);
    expect(result).toMatchObject({ ok: false, reason: 'inventoryFull' });
    expect(state.groundLoot[lootId]).toBeDefined();
  });
});
