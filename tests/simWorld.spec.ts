import { describe, expect, it } from 'vitest';
import { createSimWorld } from '../server/sim/simWorld';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { GameState } from '../server/gameState';

/**
 * SimWorld drives the REAL `createWorldTickRunner` pipeline on a
 * SimClock. These pin the two properties the clock-injection work was
 * for: the production engine now advances deterministically off virtual
 * time, and the generic systems (here: regen) actually run inside it.
 */

function enemySnapshot(state: GameState): Record<string, { health: number; x: number; z: number; aiState: string }> {
  const snap: Record<string, { health: number; x: number; z: number; aiState: string }> = {};
  for (const [id, e] of Object.entries(state.enemies)) {
    snap[id] = { health: e.health, x: e.position.x, z: e.position.z, aiState: e.aiState };
  }
  return snap;
}

describe('SimWorld — real tick pipeline on a virtual clock', () => {
  it('advancing virtual time runs the real pipeline and is deterministic', () => {
    const buildAndRun = () => {
      const sim = createSimWorld();
      // Two regenerating mobs at fixed positions (identical id seed).
      for (const pos of [{ x: 5, y: 0.5, z: 5 }, { x: -5, y: 0.5, z: -5 }]) {
        const enemy = createEnemy('goblin', 3, pos, 0);
        enemy.stats = { ...enemy.stats, hpRegen: 4 };
        enemy.health = 10;
        sim.state.enemies[enemy.id] = enemy;
      }
      sim.advance(6_000);
      return enemySnapshot(sim.state);
    };

    const runA = buildAndRun();
    const runB = buildAndRun();
    expect(runA).toEqual(runB);
    // And it actually advanced state (regen ran inside the real loop).
    expect(Object.values(runA).every((e) => e.health > 10)).toBe(true);
  });

  it('the generic regen system runs through the real maintenance phase', () => {
    const sim = createSimWorld();
    const enemy = createEnemy('goblin', 5, { x: 0, y: 0.5, z: 0 }, 0);
    enemy.stats = { ...enemy.stats, hpRegen: 5 };
    enemy.health = 1;
    sim.state.enemies[enemy.id] = enemy;

    sim.advance(10_000);

    // ~5 hp/s over ~10s, clamped at maxHealth — must have healed well past 1.
    expect(enemy.health).toBeGreaterThan(20);
    expect(enemy.health).toBeLessThanOrEqual(enemy.maxHealth);
  });

  it('virtual time advances at the tick cadence without a wall clock', () => {
    const sim = createSimWorld({ startMs: 1_000 });
    expect(sim.now()).toBe(1_000);
    sim.advance(1_000);
    // SimClock's `every` fires due slots up to (but not strictly past)
    // the new time; the clock lands on the requested instant.
    expect(sim.now()).toBe(2_000);
  });

  it('seeded full-world smoke: spawns mobs and ticks the real engine without throwing', () => {
    const sim = createSimWorld({ seedEnemies: true });
    const spawned = Object.keys(sim.state.enemies).length;
    expect(spawned).toBeGreaterThan(0);
    expect(() => sim.advance(2_000)).not.toThrow();
  });
});
