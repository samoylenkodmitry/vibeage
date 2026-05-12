import type { Server } from 'socket.io';
import type { ItemDrop, VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, InventorySlot } from '../../shared/types.js';
import type { GameState } from '../gameState.js';
import { generateLoot as generateLootFromEnemy } from './generateLoot.js';

const PICKUP_DISTANCE = 3.0;

function distanceXZ(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function createLootId(entityId: string): string {
  return `loot-${entityId}-${Date.now()}`;
}

export function addGroundLoot(state: GameState, enemyId: string, loot: ItemDrop[]): string | undefined {
  if (!loot.length) return undefined;

  const enemy = state.enemies[enemyId];
  if (!enemy) return undefined;

  const lootId = createLootId(enemyId);
  const position = { x: enemy.position.x, z: enemy.position.z };

  state.groundLoot[lootId] = { position, items: loot };

  console.log(`Added ground loot ${lootId} at position ${JSON.stringify(position)}`);
  return lootId;
}

export function spawnLootForEnemyDeath(state: GameState, io: Server, enemy: Enemy): void {
  if (!enemy.lootTableId) return;

  const loot = generateLootFromEnemy(enemy);
  if (!loot.length) return;

  const lootId = createLootId(enemy.id);
  const position = { x: enemy.position.x, z: enemy.position.z };

  state.groundLoot[lootId] = { position, items: loot };
  console.log(`Added ground loot ${lootId} at position ${JSON.stringify(position)} to game state.`);

  io.emit('msg', {
    type: 'LootSpawn',
    enemyId: enemy.id,
    lootId,
    position,
    loot,
  });

  console.log(`Sent loot spawn broadcast for ${lootId} with ${loot.length} items`);
}

export function tryGiveLoot(state: GameState, io: Server, playerId: string, lootId: string): boolean {
  console.log(`[tryGiveLoot] Attempting to find lootId: "${lootId}" for player: ${playerId}`);
  console.log(`[tryGiveLoot] Current groundLoot keys: ${JSON.stringify(Object.keys(state.groundLoot))}`);

  if (Object.keys(state.groundLoot).length < 10) {
    console.log(`[tryGiveLoot] Current groundLoot content: ${JSON.stringify(state.groundLoot)}`);
  }

  const player = state.players[playerId];
  const loot = state.groundLoot[lootId];

  if (!player) {
    console.error(`[LootPickup] Player ${playerId} not found`);
    return false;
  }

  if (!loot) {
    console.error(`[LootPickup] Loot "${lootId}" not found in state.groundLoot.`);
    return false;
  }

  console.log(`[LootPickup] Player ${playerId} picking up loot ${lootId}`);

  const playerPos = { x: player.position.x, z: player.position.z };
  const distance = distanceXZ(playerPos, loot.position);

  if (distance > PICKUP_DISTANCE) {
    console.log(`[LootPickup] Player ${playerId} too far from loot ${lootId}. Distance: ${distance.toFixed(2)}, Max: ${PICKUP_DISTANCE}`);
    return false;
  }

  console.log(`[LootPickup] Distance check passed. Distance: ${distance.toFixed(2)}`);

  const items: InventorySlot[] = loot.items.map(item => ({
    itemId: item.itemId,
    quantity: item.quantity,
  }));

  for (const item of items) {
    const existingItemIndex = player.inventory.findIndex(inv => inv.itemId === item.itemId);

    if (existingItemIndex !== -1) {
      player.inventory[existingItemIndex].quantity += item.quantity;
    } else {
      player.inventory.push(item);
    }
  }

  delete state.groundLoot[lootId];

  io.emit('msg', {
    type: 'LootPickup',
    lootId,
    playerId,
  });

  const lootNames = items.map(item => `${item.quantity}x ${item.itemId}`).join(', ');
  io.to(player.socketId).emit('msg', {
    type: 'LootAcquired',
    items,
    sourceEnemyName: lootId.split('-')[1],
  });

  console.log(`[LootPickup] Sent loot acquired notification: ${lootNames}`);
  return true;
}
