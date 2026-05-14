import type { InventorySlot } from '../../packages/protocol/messages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { PlayerState } from '../../shared/types.js';
import type { GameState } from '../gameState.js';
import { addItemsToInventory, dropsToInventorySlots } from '../inventory/inventorySlots.js';

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
  const inventoryResult = addItemsToInventory(player.inventory, items, player.maxInventorySlots);
  if (inventoryResult.ok === false) {
    return { ok: false, reason: inventoryResult.reason };
  }

  player.inventory = inventoryResult.inventory;
  delete state.groundLoot[lootId];

  return {
    ok: true,
    player,
    lootId,
    items: inventoryResult.addedItems,
    sourceEnemyName: getSourceEnemyName(lootId),
  };
}

function getSourceEnemyName(lootId: string): string | undefined {
  return lootId.split('-')[1];
}
