import { describe, expect, it } from 'vitest';
import { advanceEnemyState, type EnemyAIEvent } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { DEFAULT_PACK_AGGRO_RADIUS_M } from '../packages/content/enemies';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

// §46/slice-3 — pack aggro/disengage: per-mob radius drives both
// directions. `propagatePackAggro` runs inside `enemyAI.updateEnemyAI`;
// here we test the state-machine surface (event emission) directly.

function makePlayer(id: string, x: number, z: number): PlayerState {
  return {
    id, socketId: `s-${id}`, name: id,
    position: { x, y: 0.5, z }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: [],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  } as PlayerState;
}

describe('enemy template carries packAggroRadius', () => {
  it('createEnemy stamps the default radius (60m × multiplier 1)', () => {
    const e = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    expect(e.packAggroRadius).toBe(DEFAULT_PACK_AGGRO_RADIUS_M);
  });
});

describe('aggro acquisition emits packAggro for packed enemies', () => {
  it('emits packAggro on idle→chasing when packId is set', () => {
    const player = makePlayer('p1', 1, 0);
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.packId = 'pack-1';
    enemy.aggroRadius = 5;
    const grid = new SpatialHashGrid(1);
    grid.insert(player.id, { x: player.position.x, z: player.position.z });

    const { events } = advanceEnemyState(enemy, {
      players: { [player.id]: player }, spatialGrid: grid, deltaTime: 1 / 30, now: NOW,
    });

    expect(events.some((e: EnemyAIEvent) => e.type === 'packAggro' && e.packId === 'pack-1')).toBe(true);
  });

  it('does NOT emit packAggro when enemy has no packId', () => {
    const player = makePlayer('p1', 1, 0);
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aggroRadius = 5;
    const grid = new SpatialHashGrid(1);
    grid.insert(player.id, { x: player.position.x, z: player.position.z });

    const { events } = advanceEnemyState(enemy, {
      players: { [player.id]: player }, spatialGrid: grid, deltaTime: 1 / 30, now: NOW,
    });

    expect(events.some((e: EnemyAIEvent) => e.type === 'packAggro')).toBe(false);
  });
});

describe('chase termination emits packDisengage', () => {
  it('emits packDisengage when target dies mid-chase', () => {
    const player = makePlayer('p1', 1, 0);
    player.isAlive = false;
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.packId = 'pack-1';
    enemy.aiState = 'chasing';
    enemy.targetId = player.id;
    const grid = new SpatialHashGrid(1);

    const { events } = advanceEnemyState(enemy, {
      players: { [player.id]: player }, spatialGrid: grid, deltaTime: 1 / 30, now: NOW,
    });

    expect(events.some((e: EnemyAIEvent) => e.type === 'packDisengage' && e.packId === 'pack-1')).toBe(true);
    // Note: same-tick cascade may run returning→idle when enemy is at spawn; we
    // only care that the disengage event fired.
  });

  it('emits packDisengage when leash distance exceeded', () => {
    const player = makePlayer('p1', 9999, 0); // far away from spawn
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.packId = 'pack-1';
    enemy.aiState = 'chasing';
    enemy.targetId = player.id;
    enemy.position = { x: 9000, y: 0.5, z: 0 }; // way past leash
    const grid = new SpatialHashGrid(1);

    const { events } = advanceEnemyState(enemy, {
      players: { [player.id]: player }, spatialGrid: grid, deltaTime: 1 / 30, now: NOW,
    });

    expect(events.some((e: EnemyAIEvent) => e.type === 'packDisengage' && e.packId === 'pack-1')).toBe(true);
    expect(enemy.aiState).toBe('returning');
  });

  it('does NOT emit packDisengage when enemy has no packId', () => {
    const player = makePlayer('p1', 1, 0);
    player.isAlive = false;
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    enemy.aiState = 'chasing';
    enemy.targetId = player.id;
    const grid = new SpatialHashGrid(1);

    const { events } = advanceEnemyState(enemy, {
      players: { [player.id]: player }, spatialGrid: grid, deltaTime: 1 / 30, now: NOW,
    });

    expect(events.some((e: EnemyAIEvent) => e.type === 'packDisengage')).toBe(false);
  });
});
