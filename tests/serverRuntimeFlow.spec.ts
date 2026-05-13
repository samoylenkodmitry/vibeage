import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createCombatWorld } from '../server/combat/combatWorld';
import { resolveCastImpact } from '../server/combat/impactResolver';
import type { Cast } from '../server/combat/skillSystem';
import { handleTargetDeath } from '../server/combat/targetDeath';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createGroundLootStack } from '../server/loot/lootRuntime';
import { pickupGroundLoot } from '../server/loot/lootPickup';
import { applyMoveIntent } from '../server/movement/moveIntent';
import { advanceAll } from '../server/movement/worldMovement';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../shared/types';

const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'FlowTester',
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
  inventory: [],
  maxInventorySlots: 20,
});

describe('deterministic server runtime flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T00:00:05.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('moves, aggros, resolves combat death, spawns loot, and picks it up', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const player = makePlayer();
    const enemy = createEnemy('goblin', 1, { x: 3.5, y: 0.5, z: 0 }, 1);
    enemy.id = 'enemy1';
    enemy.health = 10;
    enemy.maxHealth = 10;
    enemy.attackDamage = 20;
    enemy.baseExperienceValue = 60;

    state.players[player.id] = player;
    state.enemies[enemy.id] = enemy;
    spatial.insert(player.id, player.position);
    spatial.insert(enemy.id, enemy.position);

    expect(applyMoveIntent(state, player.socketId, {
      type: 'MoveIntent',
      id: player.id,
      targetPos: { x: 2, z: 0 },
      clientTs: 1_000,
    }, 1_000)).toEqual({ ok: true, kind: 'move', playerId: player.id, speed: 20 });

    advanceAll(state, spatial, 100, 1_100);
    expect(player.position).toMatchObject({ x: 2, z: 0 });
    expect(player.movement?.isMoving).toBe(false);

    const enemyTick = advanceEnemyState(enemy, {
      players: state.players,
      spatialGrid: spatial,
      deltaTime: 1 / 30,
      now: 3_000,
    });
    expect(enemyTick.events).toContainEqual(expect.objectContaining({
      type: 'enemyAttack',
      enemyId: enemy.id,
      targetId: player.id,
      damage: 20,
    }));
    expect(player.health).toBe(80);

    const world = createCombatWorld(state, (caster, target) => handleTargetDeath(caster, target, {
      state,
      spatial,
      outbound,
      now: 5_000,
      spawnLoot: (lootState, _outbound, deadEnemy) => {
        createGroundLootStack(lootState, deadEnemy, [{ itemId: 'health_potion', quantity: 2 }], 5_000);
      },
    }));

    resolveCastImpact(makeFireballImpactCast(player.id, enemy.id, player.position), outbound, world);

    expect(enemy.isAlive).toBe(false);
    expect(enemy.health).toBe(0);
    expect(player.experience).toBe(60);
    expect(spatial.queryCircle({ x: enemy.position.x, z: enemy.position.z }, 0.1)).not.toContain(enemy.id);

    const lootId = 'loot-enemy1-5000';
    expect(state.groundLoot[lootId]).toEqual({
      position: { x: 3.5, z: 0 },
      items: [{ itemId: 'health_potion', quantity: 2 }],
    });

    expect(pickupGroundLoot(state, player.id, lootId)).toEqual(expect.objectContaining({
      ok: true,
      items: [{ itemId: 'health_potion', quantity: 2 }],
    }));
    expect(state.groundLoot[lootId]).toBeUndefined();
    expect(player.inventory).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
  });
});

function makeFireballImpactCast(
  casterId: string,
  targetId: string,
  position: PlayerState['position'],
): Cast {
  return {
    castId: 'cast1',
    casterId,
    skillId: 'fireball',
    state: CastState.Impact,
    origin: { x: position.x, z: position.z },
    pos: { x: position.x, z: position.z },
    startedAt: 5_000,
    progressMs: 300,
    castTimeMs: 300,
    targetId,
  };
}
