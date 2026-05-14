import type { ItemDrop } from '../../packages/protocol/messages.js';
import type { Enemy } from '../../packages/sim/entities.js';
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
