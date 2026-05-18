import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createTransientPlayer } from '../server/playerFactory';
import { MINI_BOSSES } from '../packages/content/miniBosses';

function setupHammerback() {
  const boss = createEnemy('troll', 5, { x: 50, y: 0.5, z: 50 }, 1, {
    isMiniBoss: true,
    bossId: 'hammerback',
    nameOverride: 'Hammerback',
    healthMultiplier: 3.2,
    damageMultiplier: 1.6,
  });
  boss.position = { x: 60, y: 0.5, z: 60 };
  boss.aiState = 'attacking';
  boss.targetId = 'p1';
  return boss;
}

function setupPlayer(pos: { x: number; z: number } = { x: 60, z: 60 }) {
  const p = createTransientPlayer('s1', 'tester');
  p.id = 'p1';
  p.position = { x: pos.x, y: 0.5, z: pos.z };
  p.health = 1_000_000;
  p.maxHealth = 1_000_000;
  return p;
}

describe('mini-boss signature cast', () => {
  it('emits BossTelegraph on cast start and applies AOE damage on impact', () => {
    const boss = setupHammerback();
    const player = setupPlayer();
    const players = { p1: player };
    const spatial = new SpatialHashGrid();
    const eng = MINI_BOSSES.hammerback.signatureAbility.engine;
    const start = 5_000_000;

    // First tick seeds nextSignatureReadyTs but no cast yet.
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    expect(boss.signatureCastingUntilTs).toBeUndefined();
    expect(boss.nextSignatureReadyTs).toBeDefined();

    // After cooldown elapses the next tick starts the cast and emits telegraph.
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    const res = advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });
    expect(boss.signatureCastingUntilTs).toBe(castStart + eng.windUpMs);
    const telegraph = res.events.find((e) => e.type === 'bossTelegraph');
    expect(telegraph).toBeDefined();
    expect(telegraph && telegraph.type === 'bossTelegraph' && telegraph.radius).toBe(eng.radiusUnits);

    // Mid wind-up — still no damage applied.
    const hpBeforeImpact = player.health;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 100 });
    expect(player.health).toBe(hpBeforeImpact);

    // After wind-up, AOE resolves. Player in radius → an enemyAttack
    // event fires with the signature damage value.
    const impactRes = advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + eng.windUpMs + 10,
    });
    expect(player.health).toBeLessThan(hpBeforeImpact);
    const signatureDamage = boss.attackDamage * eng.damageMul;
    const sigEvent = impactRes.events.find(
      (e) => e.type === 'enemyAttack' && e.targetId === 'p1' && Math.abs(e.damage - signatureDamage) < 0.01,
    );
    expect(sigEvent, 'expected an enemyAttack event with the signature damage').toBeDefined();
    expect(boss.signatureCastingUntilTs).toBeUndefined();
    expect(boss.nextSignatureReadyTs).toBe(castStart + eng.windUpMs + 10 + eng.cooldownMs);
  });

  it('spares players outside the AOE radius', () => {
    const boss = setupHammerback();
    const inside = setupPlayer({ x: 60, z: 60 });
    const outside = setupPlayer({ x: 200, z: 200 });
    outside.id = 'p2';
    const players = { p1: inside, p2: outside };
    const spatial = new SpatialHashGrid();
    const eng = MINI_BOSSES.hammerback.signatureAbility.engine;

    const start = 5_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });
    const beforeOutside = outside.health;
    advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + eng.windUpMs + 10,
    });

    expect(inside.health).toBeLessThan(inside.maxHealth);
    expect(outside.health).toBe(beforeOutside);
  });

  it('skips signature in non-combat states', () => {
    const boss = setupHammerback();
    boss.aiState = 'idle';
    boss.targetId = null;
    const player = setupPlayer({ x: 9_000, z: 9_000 });
    const players = { p1: player };
    const spatial = new SpatialHashGrid();

    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: 1_000_000 });
    expect(boss.signatureCastingUntilTs).toBeUndefined();
    expect(boss.nextSignatureReadyTs).toBeUndefined();
  });
});
