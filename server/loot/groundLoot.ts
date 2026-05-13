import type { Server } from 'socket.io';
import type { ItemDrop } from '../../packages/protocol/messages.js';
import type { Enemy } from '../../shared/types.js';
import type { GameState } from '../gameState.js';
import { generateLoot as generateLootFromEnemy } from './generateLoot.js';
import { pickupGroundLoot } from './lootPickup.js';
import { addGroundLootStack, createGroundLootStack } from './lootRuntime.js';

export function addGroundLoot(state: GameState, enemyId: string, loot: ItemDrop[]): string | undefined {
  const spawn = addGroundLootStack(state, enemyId, loot);
  if (!spawn) return undefined;

  console.log(`Added ground loot ${spawn.lootId} at position ${JSON.stringify(spawn.stack.position)}`);
  return spawn.lootId;
}

export function spawnLootForEnemyDeath(state: GameState, io: Server, enemy: Enemy): void {
  if (!enemy.lootTableId) return;

  const loot = generateLootFromEnemy(enemy);
  if (!loot.length) return;

  const spawn = createGroundLootStack(state, enemy, loot);
  if (!spawn) return;

  console.log(`Added ground loot ${spawn.lootId} at position ${JSON.stringify(spawn.stack.position)} to game state.`);

  io.emit('msg', {
    type: 'LootSpawn',
    enemyId: enemy.id,
    lootId: spawn.lootId,
    position: spawn.stack.position,
    loot,
  });

  console.log(`Sent loot spawn broadcast for ${spawn.lootId} with ${loot.length} items`);
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
