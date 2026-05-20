import type { ItemDrop } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { GameState, GroundLootStack } from '../gameState.js';

export type GroundLootSpawn = {
  enemyId: string;
  lootId: string;
  stack: GroundLootStack;
  loot: ItemDrop[];
};

export function addGroundLootStack(
  state: GameState,
  enemyId: string,
  loot: ItemDrop[],
  now: number = Date.now(),
): GroundLootSpawn | null {
  if (!loot.length) {
    return null;
  }

  const enemy = state.enemies[enemyId];
  if (!enemy) {
    return null;
  }

  return createGroundLootStack(state, enemy, loot, now);
}

export function createGroundLootStack(
  state: GameState,
  enemy: Enemy,
  loot: ItemDrop[],
  now: number = Date.now(),
): GroundLootSpawn | null {
  if (!loot.length) {
    return null;
  }

  const lootId = createLootId(enemy.id, now);
  const stack = {
    position: { x: enemy.position.x, z: enemy.position.z },
    items: loot,
  };

  state.groundLoot[lootId] = stack;

  return {
    enemyId: enemy.id,
    lootId,
    stack,
    loot,
  };
}

export function createLootId(entityId: string, now: number = Date.now()): string {
  return `loot-${entityId}-${now}`;
}

// §46/slice-new — player-dropped piles share the ground-loot pipeline
// (same map registration, same client render path, same pickup flow)
// but anchor at the player's position and use a player-scoped lootId.
export function createPlayerDroppedLootStack(
  state: GameState,
  player: PlayerState,
  loot: ItemDrop[],
  now: number = Date.now(),
): GroundLootSpawn | null {
  if (!loot.length) return null;
  const lootId = `loot-player-${player.id}-${now}`;
  const stack: GroundLootStack = {
    position: { x: player.position.x, z: player.position.z },
    items: loot,
  };
  state.groundLoot[lootId] = stack;
  return { enemyId: `player:${player.id}`, lootId, stack, loot };
}
