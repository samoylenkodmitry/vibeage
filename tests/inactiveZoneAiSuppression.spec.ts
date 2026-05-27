import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { isEnemyInActiveRegion } from '../server/world/regions';
import { updateEnemyAI } from '../server/ai/enemyAI';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

/**
 * ROADMAP L622 — tests for inactive-zone enemies not ticking AI.
 *
 * The cheap-inactive-zone property is what lets the server scale to
 * dozens of zones without paying AI / pathing / aggro cost for the
 * empty ones. Two gates protect this:
 *
 *  1. `isEnemyInActiveRegion(state, enemyId)` — pure check the tick
 *     pipeline uses at `tickPipeline.ts:146` to decide whether to
 *     call `updateEnemyAI` at all.
 *  2. The AI tick itself ALSO has internal short-circuits (taunt,
 *     status effects) but those don't help if the outer gate is
 *     wrong — a broken gate means every enemy ticks every frame
 *     no matter how the AI is configured.
 *
 * If a future refactor removes the gate or inverts its return, the
 * server quietly burns CPU on dormant zones. Pin both:
 *  - the gate returns false for inactive zones / true for active
 *  - the AI itself is a no-op when called on an enemy whose zone is
 *    not in `state.zones.activeZoneIds` (so the gate is the right
 *    place to enforce, not buried in the AI)
 */

describe('isEnemyInActiveRegion — gate for AI ticks', () => {
  it('returns true when the enemy has no zone mapping (legacy / unzoned spawn)', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    state.enemies[enemy.id] = enemy;
    // No `state.zones.enemyZoneIds[enemy.id]` set — the gate must
    // default to "active" so unzoned legacy spawns still tick.
    expect(state.zones.enemyZoneIds[enemy.id]).toBeUndefined();
    expect(state.zones.activeZoneIds).toHaveLength(0);
    // With no active zones declared, the gate's `createActiveRegionIdSet`
    // returns null and the check short-circuits true.
    expect(isEnemyInActiveRegion(state, enemy.id)).toBe(true);
  });

  it('returns true for an enemy in an active zone', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 2);
    state.enemies[enemy.id] = enemy;
    state.zones.activeZoneIds = ['starter-field'];
    state.zones.enemyZoneIds[enemy.id] = 'starter-field';

    expect(isEnemyInActiveRegion(state, enemy.id)).toBe(true);
  });

  it('returns false for an enemy whose zone is NOT in activeZoneIds', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 3);
    state.enemies[enemy.id] = enemy;
    state.zones.activeZoneIds = ['starter-field'];
    state.zones.enemyZoneIds[enemy.id] = 'whispering-pines';

    expect(isEnemyInActiveRegion(state, enemy.id)).toBe(false);
  });

  it('respects an explicit empty activeZoneIds set (everything inactive)', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 4);
    state.enemies[enemy.id] = enemy;
    state.zones.activeZoneIds = ['some-active-zone'];
    state.zones.enemyZoneIds[enemy.id] = 'whispering-pines';
    // Caller can pass an empty Set to force "nothing is active" —
    // used in cleanup paths during region churn.
    expect(isEnemyInActiveRegion(state, enemy.id, new Set())).toBe(false);
  });
});

describe('updateEnemyAI invocation gate', () => {
  it('an enemy in an inactive zone receives no AI update from the tick path', () => {
    // Simulates the tickPipeline gate at server/world/tickPipeline.ts:146:
    // `if (enemy.isAlive && isEnemyInActiveRegion(...)) updateEnemyAI(...)`.
    // Build a player so the AI would otherwise have something to aggro on,
    // then verify the gate prevents the call entirely.
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 5);
    enemy.isAlive = true;
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });
    state.zones.activeZoneIds = ['active-zone'];
    state.zones.enemyZoneIds[enemy.id] = 'inactive-zone';

    if (state.enemies[enemy.id].isAlive && isEnemyInActiveRegion(state, enemy.id)) {
      updateEnemyAI(state.enemies[enemy.id], state, outbound, spatial, 1 / 30, Date.now(), {} as never, state.activeCasts);
    }

    // updateEnemyAI was never called — no aiState change, no outbound publish.
    expect(enemy.aiState).toBe('idle');
    expect(outbound.publish).not.toHaveBeenCalled();
  });

  it('an enemy in an active zone DOES get the AI tick (gate complement)', () => {
    // The complement of the gate must work too, otherwise the gate
    // is a coin-flip in disguise. We only check the gate here; the
    // AI behavior itself has its own dedicated suites.
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 6);
    enemy.isAlive = true;
    state.enemies[enemy.id] = enemy;
    state.zones.activeZoneIds = ['active-zone'];
    state.zones.enemyZoneIds[enemy.id] = 'active-zone';

    expect(isEnemyInActiveRegion(state, enemy.id)).toBe(true);
  });
});

