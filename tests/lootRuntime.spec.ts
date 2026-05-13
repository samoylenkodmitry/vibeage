import { describe, expect, test } from 'vitest';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { addGroundLootStack, createGroundLootStack, createLootId } from '../server/loot/lootRuntime';

describe('loot runtime', () => {
  test('creates stable loot ids from entity id and timestamp', () => {
    expect(createLootId('enemy1', 1_746_316_800_000)).toBe('loot-enemy1-1746316800000');
  });

  test('adds a ground loot stack at the enemy position', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 3, y: 0, z: 4 }, 1);
    state.enemies[enemy.id] = enemy;

    const spawn = addGroundLootStack(
      state,
      enemy.id,
      [{ itemId: 'gold_coin', quantity: 5 }],
      1_746_316_800_000,
    );

    expect(spawn).toEqual({
      enemyId: enemy.id,
      lootId: `loot-${enemy.id}-1746316800000`,
      stack: {
        position: { x: 3, z: 4 },
        items: [{ itemId: 'gold_coin', quantity: 5 }],
      },
      loot: [{ itemId: 'gold_coin', quantity: 5 }],
    });
    expect(state.groundLoot[`loot-${enemy.id}-1746316800000`]).toEqual(spawn?.stack);
  });

  test('does not create empty loot stacks', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 3, y: 0, z: 4 }, 1);

    expect(createGroundLootStack(state, enemy, [])).toBeNull();
    expect(state.groundLoot).toEqual({});
  });
});
