import { describe, expect, it } from 'vitest';
import { moveEnemyToward } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { advanceAll } from '../server/movement/worldMovement';
import { createGameState } from '../server/gameState';

/**
 * §10:577 regression — PR #324 removed the double-step. Prior to this
 * fix `moveEnemyToward` integrated position via `velocity * dt`, AND
 * `advanceEnemyPosition` (called every tick from
 * `advanceTickPhase1MovementAndStatus`) integrated *again*, so each
 * enemy effectively ran at 2× its advertised `movementSpeed`.
 *
 * This test pins the single-step contract: after the AI sets velocity
 * and the movement phase runs once, the displacement equals
 * `velocity × dt` exactly — not twice that. Plus, calling
 * `moveEnemyToward` twice without a movement-phase pass between them
 * doesn't accumulate position drift.
 */
describe('enemy movement is single-step (§10:577 regression)', () => {
  it('AI velocity set + movement-phase advance ⇒ exactly one velocity*dt displacement', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    enemy.movementSpeed = 5; // deterministic test speed
    state.enemies[enemy.id] = enemy;
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);

    moveEnemyToward(enemy, { x: 100, z: 0 }, spatial, 0.5, Date.now());
    // AI phase only sets velocity — position should not have moved.
    expect(enemy.position.x).toBe(0);
    expect(enemy.velocity).toEqual({ x: 5, z: 0 });

    advanceAll(state, spatial, 100, Date.now());

    // Movement phase integrates once: velocity (5) × 0.1 s = 0.5 units.
    expect(enemy.position.x).toBeCloseTo(0.5, 5);
  });

  it('repeated AI updates without an interleaved movement phase do not stack position drift', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 2);
    enemy.movementSpeed = 5;
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);

    moveEnemyToward(enemy, { x: 100, z: 0 }, spatial, 1, Date.now());
    moveEnemyToward(enemy, { x: 100, z: 0 }, spatial, 1, Date.now());
    moveEnemyToward(enemy, { x: 100, z: 0 }, spatial, 1, Date.now());

    // Without a movement-phase pass between calls, the enemy never
    // actually moves — only the latest velocity stands.
    expect(enemy.position.x).toBe(0);
    expect(enemy.velocity!.x).toBe(5);
  });
});
