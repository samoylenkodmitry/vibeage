import { describe, expect, test, vi } from 'vitest';
import { updateEnemyAI } from '../server/ai/enemyAI';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (id: string, x: number, z: number): PlayerState => ({
  id,
  socketId: `${id}-socket`,
  name: id,
  position: { x, y: 0, z },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: [],

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
});

describe('updateEnemyAI pack aggro propagation', () => {
  test('flips nearby idle packmates onto the same target via spatial query', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(8);
    const player = makePlayer('player1', 1, 0);
    state.players[player.id] = player;
    spatial.insert(player.id, player.position);

    const sourceEnemy = createEnemy('wolf', 2, { x: 0, y: 0, z: 0 }, 1, { packId: 'pack-1' });
    const packmate = createEnemy('wolf', 2, { x: 3, y: 0, z: 0 }, 2, { packId: 'pack-1' });
    const farEnemy = createEnemy('wolf', 2, { x: 200, y: 0, z: 0 }, 3, { packId: 'pack-1' });
    const otherPack = createEnemy('wolf', 2, { x: 4, y: 0, z: 0 }, 4, { packId: 'pack-2' });
    state.enemies[sourceEnemy.id] = sourceEnemy;
    state.enemies[packmate.id] = packmate;
    state.enemies[farEnemy.id] = farEnemy;
    state.enemies[otherPack.id] = otherPack;
    spatial.insert(sourceEnemy.id, sourceEnemy.position);
    spatial.insert(packmate.id, packmate.position);
    spatial.insert(farEnemy.id, farEnemy.position);
    spatial.insert(otherPack.id, otherPack.position);

    const outbound = { publish: vi.fn() };
    updateEnemyAI(sourceEnemy, state, outbound, spatial, 1 / 30);

    expect(packmate.targetId).toBe(player.id);
    expect(packmate.aiState).toBe('chasing');
    expect(farEnemy.targetId).toBeNull();
    expect(farEnemy.aiState).toBe('idle');
    expect(otherPack.targetId).toBeNull();
    expect(otherPack.aiState).toBe('idle');
  });
});
