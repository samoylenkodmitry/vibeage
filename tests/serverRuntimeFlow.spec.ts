import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { playerInventorySlots } from './helpers/inventoryView';
import { updateEnemyAI } from '../server/ai/enemyAI';
import { createCombatWorld } from '../server/combat/combatWorld';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { tickCasts, type Cast } from '../server/combat/skillSystem';
import { handleTargetDeath } from '../server/combat/targetDeath';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createGroundLootStack } from '../server/loot/lootRuntime';
import { pickupGroundLoot } from '../server/loot/lootPickup';
import { applyMoveIntent } from '../server/movement/moveIntent';
import { advanceAll } from '../server/movement/worldMovement';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

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
    enemy.stats = { ...enemy.stats, attackPower: 20 }; // mobStrike scales off attackPower
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

    // Enemy attacks the player through the AI (castSkill intent) + the
    // shared cast pipeline (tickCasts resolves the mobStrike). Mob damage
    // now rolls variance via getDamage, so assert a band around 20.
    const attackWorld = createCombatWorld(state, () => undefined);
    updateEnemyAI(enemy, 1 / 30, {
      state, outbound, spatial, now: 3_000, world: attackWorld, activeCasts: state.activeCasts,
    });
    tickCasts(state.activeCasts, 100, outbound, attackWorld, 3_000);
    expect(player.health).toBeGreaterThanOrEqual(77);
    expect(player.health).toBeLessThanOrEqual(83);

    const world = createCombatWorld(state, (caster, target) => handleTargetDeath(caster, target, {
      state,
      spatial,
      outbound,
      now: 5_000,
      spawnLoot: (lootState, _outbound, deadEnemy) => {
        createGroundLootStack(lootState, deadEnemy, [{ itemId: 'health_potion', quantity: 2 }], 5_000);
      },
    }));

    resolveCastImpact(makeFireballImpactCast(player.id, enemy.id, player.position), outbound, world, Date.now());

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
    expect(playerInventorySlots(player)).toMatchObject([{ itemId: 'health_potion', quantity: 2 }]);
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
