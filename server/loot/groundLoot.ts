import type { Server } from 'socket.io';
import type { ItemDrop } from '../../packages/protocol/messages.js';
import type { Enemy } from '../../shared/types.js';
import type { GameState } from '../gameState.js';
import { generateLoot as generateLootFromEnemy } from './generateLoot.js';
import { pickupGroundLoot } from './lootPickup.js';

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
  const result = pickupGroundLoot(state, playerId, lootId);

  if (result.ok === false) {
    return false;
  }

  io.emit('msg', {
    type: 'LootPickup',
    lootId,
    playerId,
  });

  io.to(result.player.socketId).emit('msg', {
    type: 'LootAcquired',
    items: result.items,
    sourceEnemyName: result.sourceEnemyName,
  });

  return true;
}
