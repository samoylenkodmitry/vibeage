import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createTransientPlayer } from '../server/playerFactory';
import { MINI_BOSSES, mechanicOuterRadius } from '../packages/content/miniBosses';

/**
 * Archwork #6 follow-up — cone mechanic regression.
 *
 * Vorthax's Cinder Breath fires a forward cone (lengthUnits 14,
 * halfAngleDeg 30 → 60° total arc). Cone vertex is Vorthax's
 * position; direction is locked at cast start toward the current
 * target. Damage applies to players inside the wedge.
 *
 * Three players placed around the boss:
 *   - in-cone (16 units east of boss, inside both length + angle)
 *     — the wedge points east since target is east of boss
 *   - off-axis (12 units north — within length but ~90° off axis)
 *   - far (40 units east — within angle but past length)
 *
 * Expected after impact: only the in-cone player takes damage.
 */
function setupVorthax() {
  const boss = createEnemy('dragon', 30, { x: 0, y: 0.5, z: 0 }, 1, {
    isMiniBoss: true,
    bossId: 'vorthax_ember_wyrm',
    nameOverride: 'Vorthax the Ember Wyrm',
    healthMultiplier: 3.0,
    damageMultiplier: 1.8,
  });
  boss.position = { x: 100, y: 0.5, z: 100 };
  boss.aiState = 'attacking';
  boss.targetId = 'p_target';
  return boss;
}

function setupPlayerAt(id: string, x: number, z: number) {
  const p = createTransientPlayer(`s-${id}`, `tester-${id}`);
  p.id = id;
  p.position = { x, y: 0.5, z };
  p.health = 1_000_000;
  p.maxHealth = 1_000_000;
  return p;
}

describe('Vorthax cone — content spec', () => {
  it('is typed as a cone mechanic on the content spec', () => {
    const mech = MINI_BOSSES.vorthax_ember_wyrm.signatureAbility.mechanic;
    expect(mech.kind).toBe('cone');
    if (mech.kind === 'cone') {
      expect(mech.lengthUnits).toBe(14);
      expect(mech.halfAngleDeg).toBe(30);
    }
    expect(mechanicOuterRadius(mech)).toBe(14);
  });
});

describe('Vorthax cone — telegraph event', () => {
  it('carries directionRad + halfAngleDeg + boss-anchored vertex', () => {
    const boss = setupVorthax();
    const target = setupPlayerAt('p_target', 110, 100);
    const players = { p_target: target };
    const spatial = new SpatialHashGrid();

    const start = 3_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    const castRes = advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart,
    });

    const telegraph = castRes.events.find((e) => e.type === 'bossTelegraph');
    expect(telegraph).toBeDefined();
    if (telegraph?.type === 'bossTelegraph') {
      expect(telegraph.radius).toBe(14);
      expect(telegraph.halfAngleDeg).toBe(30);
      expect(telegraph.directionRad).toBeCloseTo(0, 3);
      expect(telegraph.x).toBe(100);
      expect(telegraph.z).toBe(100);
      expect(telegraph.abilityName).toBe('Cinder Breath');
    }
  });
});

describe('Vorthax cone — damage selection', () => {
  it('hits inside the wedge, spares off-axis + over-length players', () => {
    const boss = setupVorthax();
    const target = setupPlayerAt('p_target', 113, 100);
    const offAxis = setupPlayerAt('p_off', 100, 112);
    const far = setupPlayerAt('p_far', 140, 100);
    const players = { p_target: target, p_off: offAxis, p_far: far };
    const spatial = new SpatialHashGrid();

    const start = 3_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });

    const hpBefore = { target: target.health, off: offAxis.health, far: far.health };
    advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 2500 + 10,
    });

    expect(target.health, 'in-cone player took damage').toBeLessThan(hpBefore.target);
    expect(offAxis.health, 'off-axis player spared').toBe(hpBefore.off);
    expect(far.health, 'over-length player spared').toBe(hpBefore.far);
  });
});

describe('Vorthax cone — direction lock', () => {
  it('direction is locked at cast start (boss can move during wind-up)', () => {
    const boss = setupVorthax();
    const target = setupPlayerAt('p_target', 113, 100);
    const players = { p_target: target };
    const spatial = new SpatialHashGrid();

    const start = 3_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });

    // Warp boss north 5 units mid wind-up. Direction stays east.
    boss.position = { x: 100, y: 0.5, z: 95 };

    advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 2500 + 10,
    });
    // (113, 100) relative to new boss pos (100, 95) is (+13, +5):
    // atan2(5, 13) ≈ 21° < 30°, distance ≈ 13.9 < 14. Still hits.
    expect(target.health).toBeLessThan(target.maxHealth);
  });
});
