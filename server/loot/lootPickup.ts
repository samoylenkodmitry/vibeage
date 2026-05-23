import type { InventorySlot } from '../../packages/protocol/messages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { addItemsToPlayer, restoreInventory, snapshotInventory } from '../inventory/aggregateBridge.js';
import { dropsToInventorySlots } from '../inventory/inventorySlots.js';

const PICKUP_DISTANCE = 3.0;

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
      reason: 'playerNotFound' | 'lootNotFound' | 'tooFar' | 'inventoryFull' | 'itemNotFound' | 'invariantViolation';
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
      restoreInventory(player, snapshot);
      // Propagate the ACTUAL TransactionError instead of squashing
      // every failure to `inventoryFull` — that lied to users staring
      // at a half-empty bag whose pickup was rejected because of
      // either an `itemNotFound` (retired loot template) or an
      // `invariantViolation` (pre-existing orphan instance).
      return { ok: false, reason: mapAddError('error' in result ? result.error : 'invariantViolation') };
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

type AddError = 'inventoryFull' | 'itemNotFound' | 'invariantViolation' | 'itemLocked' | 'notStackable' | 'invalidSplitAmount' | 'templateMismatch' | 'stackOverflow';

function mapAddError(error: AddError | string): Extract<GroundLootPickupResult, { ok: false }>['reason'] {
  if (error === 'inventoryFull' || error === 'itemNotFound' || error === 'invariantViolation') {
    return error;
  }
  // itemLocked / notStackable / stackOverflow don't reach the pickup
  // path today. Fold them into invariantViolation so the player gets
  // a clear "something is wrong" message instead of a misleading
  // "bag is full".
  return 'invariantViolation';
}
