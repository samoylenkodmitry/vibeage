import type { InventorySlot } from '../../packages/protocol/messages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { addItemsToPlayer, restoreInventory, snapshotInventory } from '../inventory/aggregateBridge.js';
import { dropsToInventorySlots } from '../inventory/inventorySlots.js';

export const PICKUP_DISTANCE = 3.0;

export type GroundLootPickupResult =
  | {
      ok: true;
      player: PlayerState;
      lootId: string;
      items: InventorySlot[];
      sourceEnemyName: string | undefined;
    }
  | {
      ok: false;
      reason: 'playerNotFound' | 'lootNotFound' | 'tooFar' | 'inventoryFull';
    };

export function pickupGroundLoot(state: GameState, playerId: string, lootId: string): GroundLootPickupResult {
  const player = state.players[playerId];
  const loot = state.groundLoot[lootId];

  if (!player) {
    return { ok: false, reason: 'playerNotFound' };
  }

  if (!loot) {
    return { ok: false, reason: 'lootNotFound' };
  }

  const playerPos = { x: player.position.x, z: player.position.z };
  if (distanceXZ(playerPos, loot.position) > PICKUP_DISTANCE) {
    return { ok: false, reason: 'tooFar' };
  }

  const items = dropsToInventorySlots(loot.items);
  const snapshot = snapshotInventory(player);
  const addedItems: InventorySlot[] = [];
  for (const drop of items) {
    const result = addItemsToPlayer(player, drop.itemId, drop.quantity);
    if (!result.ok) {
      // Anti-dupe: any partial add is rolled back so the loot pile stays on
      // the ground for another attempt. Caller sees a clean failure.
      restoreInventory(player, snapshot);
      return { ok: false, reason: 'inventoryFull' };
    }
    addedItems.push({ itemId: drop.itemId, quantity: drop.quantity });
  }

  delete state.groundLoot[lootId];

  return {
    ok: true,
    player,
    lootId,
    items: addedItems,
    sourceEnemyName: getSourceEnemyName(lootId),
  };
}

function getSourceEnemyName(lootId: string): string | undefined {
  return lootId.split('-')[1];
}
