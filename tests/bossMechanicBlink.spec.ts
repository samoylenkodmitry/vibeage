import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createTransientPlayer } from '../server/playerFactory';
import { MINI_BOSSES, mechanicOuterRadius } from '../packages/content/miniBosses';
import type { Enemy, PlayerState } from '../packages/sim/entities';

/**
 * Archwork #6 follow-up — blink mechanic regression.
 *
 * Mistwalker's Veil Step was a generic AOE-circle; the lore always
 * promised "Phases briefly out of sight and reappears behind the
 * target." Now the engine actually does that: on impact the
 * Mistwalker teleports `teleportOffset` m past the locked target
 * (along the line from boss → target, far side) and applies
 * single-target backstab damage.
 */

function setupMistwalker(): Enemy {
  const boss = createEnemy('skeleton', 12, { x: 0, y: 0.5, z: 0 }, 1, {
    isMiniBoss: true,
    bossId: 'mistwalker',
    nameOverride: 'The Mistwalker',
    healthMultiplier: 2.6,
    damageMultiplier: 1.6,
  });
  boss.position = { x: 100, y: 0.5, z: 100 };
  boss.aiState = 'attacking';
  boss.targetId = 'p_target';
  return boss;
}

function setupPlayer(id: string, x: number, z: number): PlayerState {
  const p = createTransientPlayer(`s-${id}`, `tester-${id}`);
  p.id = id;
  p.position = { x, y: 0.5, z };
  p.health = 1_000_000;
  p.maxHealth = 1_000_000;
  return p;
}

describe('Mistwalker blink — content spec', () => {
  it('is typed as a blink mechanic on the content spec', () => {
    const mech = MINI_BOSSES.mistwalker.signatureAbility.mechanic;
    expect(mech.kind).toBe('blink');
    if (mech.kind === 'blink') {
      expect(mech.teleportOffset).toBe(1.5);
      expect(mech.damageMul).toBe(2.2);
    }
    expect(mechanicOuterRadius(mech)).toBe(2);
  });
});

describe('Mistwalker blink — teleport + backstab', () => {
  it('moves the boss to behind the locked target and damages only that player', () => {
    const boss = setupMistwalker();
    // Boss at (100, 100); target at (110, 100). Boss should
    // teleport to (110 + 1.5, 100) = (111.5, 100) (far side of
    // target from boss).
    const target = setupPlayer('p_target', 110, 100);
    const bystander = setupPlayer('p_other', 105, 100); // closer than offset but NOT the locked target
    const players = { p_target: target, p_other: bystander };
    const spatial = new SpatialHashGrid();

    const start = 3_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });

    const hpBefore = { target: target.health, bystander: bystander.health };
    advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 1400 + 10,
    });

    expect(boss.position.x, 'boss teleported to behind target (X)').toBeCloseTo(111.5, 3);
    expect(boss.position.z, 'boss teleported to behind target (Z)').toBeCloseTo(100, 3);
    expect(target.health, 'locked target took backstab damage').toBeLessThan(hpBefore.target);
    expect(bystander.health, 'bystander untouched (single-target)').toBe(hpBefore.bystander);
  });
});

describe('Mistwalker blink — target lock', () => {
  it('blinks to the originally-marked target even if aggro changed mid wind-up', () => {
    const boss = setupMistwalker();
    const original = setupPlayer('p_target', 110, 100);
    const newAggro = setupPlayer('p_new', 100, 110);
    const players = { p_target: original, p_new: newAggro };
    const spatial = new SpatialHashGrid();

    const start = 3_000_000;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    advanceEnemyState(boss, { players, spatialGrid: spatial, deltaTime: 0.05, now: castStart });

    // Mid wind-up, boss aggro flips to a different player. The
    // blink should STILL land on the originally-locked target.
    boss.targetId = 'p_new';

    advanceEnemyState(boss, {
      players, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 1400 + 10,
    });

    expect(original.health).toBeLessThan(original.maxHealth);
    expect(newAggro.health).toBe(newAggro.maxHealth);
  });
});
