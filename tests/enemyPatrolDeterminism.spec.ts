import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

const NOW = 1_700_000_000_000;

/**
 * Mulberry32: tiny deterministic PRNG, used here only to seed the
 * patrol-target picker so we can assert reproducibility.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('patrol target generation accepts a seeded rng', () => {
  it('produces the same patrolTarget for two enemies given the same rng seed', () => {
    const seedA = mulberry32(42);
    const seedB = mulberry32(42);
    const enemyA = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    const enemyB = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);

    advanceEnemyState(enemyA, {
      players: {},
      spatialGrid: new SpatialHashGrid(1),
      deltaTime: 1 / 30,
      now: NOW,
      rng: seedA,
    });
    advanceEnemyState(enemyB, {
      players: {},
      spatialGrid: new SpatialHashGrid(1),
      deltaTime: 1 / 30,
      now: NOW,
      rng: seedB,
    });

    expect(enemyA.patrolTarget).toEqual(enemyB.patrolTarget);
  });

  it('produces different patrolTargets for different rng seeds', () => {
    const enemyA = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    const enemyB = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);

    advanceEnemyState(enemyA, {
      players: {}, spatialGrid: new SpatialHashGrid(1),
      deltaTime: 1 / 30, now: NOW, rng: mulberry32(1),
    });
    advanceEnemyState(enemyB, {
      players: {}, spatialGrid: new SpatialHashGrid(1),
      deltaTime: 1 / 30, now: NOW, rng: mulberry32(2),
    });

    expect(enemyA.patrolTarget).not.toEqual(enemyB.patrolTarget);
  });

  it('defaults to Math.random when rng is omitted (production behaviour preserved)', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    advanceEnemyState(enemy, {
      players: {}, spatialGrid: new SpatialHashGrid(1),
      deltaTime: 1 / 30, now: NOW,
    });
    expect(enemy.patrolTarget).toBeDefined();
  });

  it('seeded patrol-wait is reproducible across enemies', () => {
    const NOWLATE = NOW + 60_000;
    // First make each enemy generate a patrol target, then immediately
    // arrive at it so advancePatrollingEnemy sets the patrolWaitUntilTs.
    function runPatrolToCompletion(seed: number) {
      const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
      advanceEnemyState(enemy, {
        players: {}, spatialGrid: new SpatialHashGrid(1),
        deltaTime: 1 / 30, now: NOW, rng: mulberry32(seed),
      });
      // Place enemy at its patrol target so the arrival branch fires.
      if (enemy.patrolTarget) {
        enemy.position = { x: enemy.patrolTarget.x, y: 0, z: enemy.patrolTarget.z };
      }
      advanceEnemyState(enemy, {
        players: {}, spatialGrid: new SpatialHashGrid(1),
        deltaTime: 1 / 30, now: NOWLATE, rng: mulberry32(seed + 100),
      });
      return enemy.patrolWaitUntilTs;
    }

    expect(runPatrolToCompletion(7)).toBe(runPatrolToCompletion(7));
  });
});
