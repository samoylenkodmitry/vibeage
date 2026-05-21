import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createWorldCombatBridge, handleClientMessage } from '../server/world/clientMessageRouter';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { Enemy, PlayerState } from '../packages/sim/entities';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';

// §52 #2 — `PlayerState.inventory` retired. Seed via the aggregate
// bridge so the wire-projection still surfaces the item on
// RequestInventory.
const makePlayer = (): PlayerState => {
  const player: PlayerState = {
    id: 'player1',
    socketId: 'socket1',
    name: 'InventoryTester',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'mage',
    unlockedSkills: ['fireball'],
    skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
    characterInventory: createEmptyInventory('player1', { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 }),
  };
  addItemsToPlayer(player, 'health_potion', 7);
  return player;
};

describe('client message router', () => {
  test('handles RequestInventory through the world message boundary', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const emit = vi.fn();
    const socket = { id: 'socket1', emit };

    handleClientMessage(
      socket,
      state,
      { type: 'RequestInventory' },
      { publish: vi.fn() },
      new SpatialHashGrid(),
    );

    // §52 #11 — wire shape now carries `slotIndex` + `instanceId`
    // per slot (instanceId is a nanoid so just check structure).
    expect(emit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'InventoryUpdate',
      playerId: 'player1',
      maxInventorySlots: 20,
      inventory: [expect.objectContaining({
        itemId: 'health_potion', quantity: 7, slotIndex: 0,
      })],
    }));
  });

  test('uses spatial membership for combat-world entity queries', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    state.enemies.enemy1 = makeEnemy({ id: 'enemy1', position: { x: 1, y: 0.5, z: 0 } });
    state.enemies.enemy2 = makeEnemy({ id: 'enemy2', position: { x: 1, y: 0.5, z: 0 } });
    spatial.insert('enemy1', { x: 1, z: 0 });

    const world = createWorldCombatBridge(state, outbound, spatial);

    expect(world.getEntitiesInCircle({ x: 0, z: 0 }, 2).map((entity) => entity.id)).toEqual(['enemy1']);
  });
});

function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'enemy1',
    type: 'goblin',
    name: 'Goblin',
    level: 1,
    position: { x: 0, y: 0.5, z: 0 },
    spawnPosition: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    isAlive: true,
    attackDamage: 10,
    attackRange: 2,
    baseExperienceValue: 50,
    experienceValue: 50,
    statusEffects: [],
    aiState: 'idle',
    aggroRadius: 15,
    attackCooldownMs: 2000,
    lastAttackTime: 0,
    movementSpeed: 6,
    velocity: { x: 0, z: 0 },
    ...overrides,
  };
}
