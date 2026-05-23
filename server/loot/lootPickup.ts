import type { InventorySlot } from '../../packages/protocol/messages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { addItemsToPlayer } from '../inventory/aggregateBridge.js';
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

  // §52 follow-up — partial pickup. A wyvern boss can drop 4+ items
  // at once and a bag with 1 free slot used to rollback the whole
  // pickup, leaving the player staring at "bag full" while looking
  // at a 19/20 bag. Now: pick up what fits, leave what doesn't on
  // the ground for a follow-up attempt after the player makes room.
  // Gold-coin drops always succeed (credited to player.gold without
  // a slot) so the player never \"loses\" coins to a full bag.
  //
  // Anti-dupe: the pile state is the authoritative remaining list.
  // Items that succeeded are removed from the pile; items that
  // failed stay. If the pile ends up empty, it's deleted.
  const items = dropsToInventorySlots(loot.items);
  const addedItems: InventorySlot[] = [];
  const remainingDrops: typeof loot.items = [];
  let firstFatalError: AddError | null = null;
  for (const drop of items) {
    const result = addItemsToPlayer(player, drop.itemId, drop.quantity);
    if (result.ok) {
      addedItems.push({ itemId: drop.itemId, quantity: drop.quantity });
    } else {
      const err = 'error' in result ? result.error : 'invariantViolation';
      // Surface the first non-inventoryFull error so the player
      // sees the actual cause (orphan template, missing template,
      // …) instead of a generic \"bag full\".
      if (firstFatalError === null && err !== 'inventoryFull') firstFatalError = err as AddError;
      remainingDrops.push(drop);
    }
  }

  if (addedItems.length === 0) {
    // Nothing was picked up — pile stays untouched, surface the
    // actual reason.
    return { ok: false, reason: mapAddError(firstFatalError ?? 'inventoryFull') };
  }

  if (remainingDrops.length === 0) {
    delete state.groundLoot[lootId];
  } else {
    state.groundLoot[lootId] = { ...loot, items: remainingDrops };
  }

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
