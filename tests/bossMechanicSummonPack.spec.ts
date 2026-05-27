import { describe, expect, it, vi } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { updateEnemyAI } from '../server/ai/enemyAI';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createTransientPlayer } from '../server/playerFactory';
import { MINI_BOSSES, mechanicOuterRadius } from '../packages/content/miniBosses';
import type { Enemy, PlayerState } from '../packages/sim/entities';

/**
 * Archwork #6 follow-up — summonPack mechanic regression.
 *
 * Grakk's Warband Howl was a generic AOE-circle; the lore always
 * said "Calls every goblin in the zone to converge on the threat".
 * Now it actually does that: on impact emit a `summonPack` event
 * that pulls every alive goblin within 80m onto Grakk's current
 * target — regardless of the goblin's current AI state.
 */

function setupGrakk(): Enemy {
  const boss = createEnemy('goblin', 5, { x: 100, y: 0.5, z: 100 }, 1, {
    isMiniBoss: true,
    bossId: 'grakk',
    nameOverride: 'Grakk the Goblin Chief',
    healthMultiplier: 2.8,
    damageMultiplier: 1.4,
  });
  boss.position = { x: 110, y: 0.5, z: 110 };
  boss.aiState = 'attacking';
  boss.targetId = 'p1';
  boss.packId = 'grakk_pack';
  return boss;
}

function setupGoblin(id: string, x: number, z: number, state: Enemy['aiState'], targetId: string | null = null): Enemy {
  const goblin = createEnemy('goblin', 3, { x: 100, y: 0.5, z: 100 }, 1);
  goblin.id = id;
  goblin.position = { x, y: 0.5, z };
  goblin.aiState = state;
  goblin.targetId = targetId;
  goblin.packId = 'grakk_pack';
  return goblin;
}

function setupPlayer(id: string, x = 110, z = 110): PlayerState {
  const p = createTransientPlayer(`s-${id}`, `tester-${id}`);
  p.id = id;
  p.position = { x, y: 0.5, z };
  p.health = 1_000_000;
  p.maxHealth = 1_000_000;
  return p;
}

describe('Grakk summonPack — content spec', () => {
  it('is typed as a summonPack mechanic on the content spec', () => {
    const mech = MINI_BOSSES.grakk.signatureAbility.mechanic;
    expect(mech.kind).toBe('summonPack');
    if (mech.kind === 'summonPack') {
      expect(mech.summonRadius).toBe(80);
      expect(mech.damageMul).toBe(0);
    }
    expect(mechanicOuterRadius(mech)).toBe(80);
  });
});

describe('Grakk summonPack — telegraph event', () => {
  it('emits a BossTelegraph but no damage event on impact', () => {
    const boss = setupGrakk();
    const player = setupPlayer('p1');
    const spatial = new SpatialHashGrid();

    const start = 5_000_000;
    advanceEnemyState(boss, { players: { p1: player }, spatialGrid: spatial, deltaTime: 0.05, now: start });
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    const castRes = advanceEnemyState(boss, {
      players: { p1: player }, spatialGrid: spatial, deltaTime: 0.05, now: castStart,
    });

    const telegraph = castRes.events.find((e) => e.type === 'bossTelegraph');
    expect(telegraph).toBeDefined();

    const hpBefore = player.health;
    const impactRes = advanceEnemyState(boss, {
      players: { p1: player }, spatialGrid: spatial, deltaTime: 0.05, now: castStart + 1500 + 10,
    });

    // No damage to the player from summonPack itself.
    expect(player.health).toBe(hpBefore);
    expect(impactRes.events.some((e) => e.type === 'enemyAttack')).toBe(false);
    expect(impactRes.events.some((e) => e.type === 'summonPack')).toBe(true);
  });
});

describe('Grakk summonPack — packmate rally', () => {
  it('pulls idle / patrolling / mid-chase packmates onto Grakk\'s target', () => {
    const boss = setupGrakk();
    // Three goblins inside 80m, all in different AI states. Normal
    // packAggro would only wake the first two; summonPack pulls all
    // three.
    const idle = setupGoblin('g_idle', 120, 120, 'idle');
    const patrolling = setupGoblin('g_patrol', 130, 130, 'patrolling');
    const chasingOther = setupGoblin('g_chase', 140, 140, 'chasing', 'p_other');
    // One goblin OUTSIDE the 80m radius (well beyond) — must stay
    // untouched.
    const far = setupGoblin('g_far', 600, 600, 'idle');

    const enemies: Record<string, Enemy> = {
      [boss.id]: boss,
      [idle.id]: idle,
      [patrolling.id]: patrolling,
      [chasingOther.id]: chasingOther,
      [far.id]: far,
    };
    const player = setupPlayer('p1', 105, 105);
    const players = { p1: player };
    const spatial = new SpatialHashGrid();
    for (const e of Object.values(enemies)) spatial.insert(e.id, e.position);

    // Drive a full advanceEnemyState + emit cycle so propagateSummonPack runs.
    const outbound = { publish: vi.fn() };
    const gameState = { players, enemies };
    const start = 5_000_000;
    vi.setSystemTime(start);
    updateEnemyAI(boss, gameState as never, outbound as never, spatial, 0.05, Date.now(), {} as never, {});
    const castStart = (boss.nextSignatureReadyTs ?? start) + 10;
    vi.setSystemTime(castStart);
    updateEnemyAI(boss, gameState as never, outbound as never, spatial, 0.05, Date.now(), {} as never, {});
    vi.setSystemTime(castStart + 1500 + 10);
    updateEnemyAI(boss, gameState as never, outbound as never, spatial, 0.05, Date.now(), {} as never, {});

    expect(idle.targetId, 'idle goblin pulled onto Grakk\'s target').toBe('p1');
    expect(idle.aiState).toBe('chasing');
    expect(patrolling.targetId, 'patrolling goblin pulled onto Grakk\'s target').toBe('p1');
    expect(patrolling.aiState).toBe('chasing');
    expect(chasingOther.targetId, 'mid-chase goblin re-targeted off p_other onto p1').toBe('p1');
    expect(chasingOther.aiState).toBe('chasing');
    expect(far.targetId, 'out-of-range goblin untouched').toBe(null);
    expect(far.aiState).toBe('idle');
    vi.useRealTimers();
  });
});
