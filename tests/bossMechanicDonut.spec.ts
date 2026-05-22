import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createTransientPlayer } from '../server/playerFactory';
import { MINI_BOSSES, mechanicInnerRadius, mechanicOuterRadius } from '../packages/content/miniBosses';

/**
 * Archwork #6 — donut mechanic regression.
 *
 * Magmaheart's signature is a ring-shaped AOE: damage between the
 * inner safe-spot radius and the outer threat radius, with a safe
 * zone at the centre. The lore literally says "jump in or stand
 * far to skip it"; this test asserts the engine honours that.
 *
 * Three players:
 *   - inside  (1.0 units from cast point — safely inside the donut)
 *   - in-ring (6.0 units — squarely in the danger ring)
 *   - far     (60 units — outside outer radius)
 *
 * Expected after impact:
 *   - inside.health unchanged (donut spared)
 *   - in-ring.health < before (damage applied)
 *   - far.health unchanged (out of range)
 *
 * Also pins the telegraph event shape: it must include innerRadius
 * so the client renders the safe-spot ring.
 */
describe('Magmaheart Forge Pulse donut mechanic', () => {
  function setupMagmaheart() {
    const boss = createEnemy('lava_golem', 20, { x: 100, y: 0.5, z: 100 }, 1, {
      isMiniBoss: true,
      bossId: 'magmaheart',
      nameOverride: 'Magmaheart',
      healthMultiplier: 3.0,
      damageMultiplier: 1.8,
    });
    boss.position = { x: 110, y: 0.5, z: 110 };
    boss.aiState = 'attacking';
    boss.targetId = 'p1';
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

  it('is typed as a donut mechanic on the content spec', () => {
    const mech = MINI_BOSSES.magmaheart.signatureAbility.mechanic;
    expect(mech.kind).toBe('donut');
    expect(mechanicOuterRadius(mech)).toBe(10);
    expect(mechanicInnerRadius(mech)).toBe(3.5);
  });

  it('emits BossTelegraph carrying innerRadius for the client ring renderer', () => {
    const boss = setupMagmaheart();
    // Cast aims at boss.targetId's current position. Place p1 right
    // at the boss so the cast point is unambiguous.
    const p1 = setupPlayerAt('p1', 110, 110);
    const spatial = new SpatialHashGrid();

    const start = 4_000_000;
    advanceEnemyState(boss, { players: { p1 }, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    const castRes = advanceEnemyState(boss, {
      players: { p1 }, spatialGrid: spatial, deltaTime: 0.05, now: castStart,
    });

    const telegraph = castRes.events.find((e) => e.type === 'bossTelegraph');
    expect(telegraph, 'Magmaheart emitted a bossTelegraph at cast start').toBeDefined();
    if (telegraph?.type === 'bossTelegraph') {
      expect(telegraph.radius).toBe(10);
      expect(telegraph.innerRadius).toBe(3.5);
      expect(telegraph.abilityName).toBe('Forge Pulse');
    }
  });

  it('spares the safe-spot at centre, hits the danger ring, ignores the far player', () => {
    const boss = setupMagmaheart();
    // Cast aims at p1's position (boss.targetId). Place p1 at the
    // boss so the cast lands at (110, 110); the other two players
    // sit at known distances from that point.
    const p1 = setupPlayerAt('p1', 110, 110);
    const insideSafe = setupPlayerAt('p_safe', 111.0, 111.0);    // ~1.41 from cast point — INSIDE the 3.5 safe ring
    const inRing = setupPlayerAt('p_ring', 116, 110);            // 6.0 from cast point — squarely in the donut
    const far = setupPlayerAt('p_far', 200, 200);                // ~127 from cast point — way out
    const players = { p1, p_safe: insideSafe, p_ring: inRing, p_far: far };
    const spatial = new SpatialHashGrid();

    const start = 4_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });

    const hpBefore = {
      p1: p1.health,
      safe: insideSafe.health,
      ring: inRing.health,
      far: far.health,
    };
    advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 1700 + 10,
    });

    // p1 at the dead centre is inside the safe spot too — and is
    // closer to the cast point than insideSafe.
    expect(p1.health, 'p1 at cast centre is inside the safe spot').toBe(hpBefore.p1);
    expect(insideSafe.health, 'safe-spot player took no damage').toBe(hpBefore.safe);
    expect(inRing.health, 'danger-ring player took damage').toBeLessThan(hpBefore.ring);
    expect(far.health, 'far player unaffected').toBe(hpBefore.far);
  });
});
