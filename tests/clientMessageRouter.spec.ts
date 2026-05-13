import { describe, expect, test, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { createGameState } from '../server/gameState';
import { createWorldCombatBridge, handleClientMessage } from '../server/world/clientMessageRouter';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { Enemy, PlayerState } from '../shared/types';

const makePlayer = (): PlayerState => ({
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
  inventory: [{ itemId: 'gold_coin', quantity: 7 }],
  maxInventorySlots: 20,
});

describe('client message router', () => {
  test('handles RequestInventory through the world message boundary', () => {
    const state = createGameState();
    state.players.player1 = makePlayer();
    const emit = vi.fn();
    const socket = { id: 'socket1', emit } as unknown as Socket;

    handleClientMessage(
      socket,
      state,
      { type: 'RequestInventory' },
      { emit: vi.fn() } as unknown as Server,
      new SpatialHashGrid(),
    );

    expect(emit).toHaveBeenCalledWith('msg', {
      type: 'InventoryUpdate',
      playerId: 'player1',
      inventory: [{ itemId: 'gold_coin', quantity: 7 }],
      maxInventorySlots: 20,
    });
  });

  test('uses spatial membership for combat-world entity queries', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const io = { emit: vi.fn() } as unknown as Server;
    state.enemies.enemy1 = makeEnemy({ id: 'enemy1', position: { x: 1, y: 0.5, z: 0 } });
    state.enemies.enemy2 = makeEnemy({ id: 'enemy2', position: { x: 1, y: 0.5, z: 0 } });
    spatial.insert('enemy1', { x: 1, z: 0 });

    const world = createWorldCombatBridge(state, io, spatial);

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
