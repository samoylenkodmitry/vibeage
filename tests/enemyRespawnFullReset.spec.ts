import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  createEnemy,
  ENEMY_RESPAWN_DELAY_MS,
  MINI_BOSS_RESPAWN_DELAY_MS,
  respawnDeadEnemies,
} from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

/**
 * Archwork item #2 sub-work #4 — pin the explicit full-reset
 * contract for respawning enemies.
 *
 * The pre-rework `respawnDeadEnemies` only reset isAlive / health /
 * position / targetId / statusEffects. Everything else carried
 * through to the new life, which surfaced as a series of subtle bugs:
 *  - bosses respawned still enraged or mid-signature
 *  - mobs respawned with stale velocity → silently drifting at spawn
 *  - aiState 'chasing' carried over → first AI tick saw the old
 *    target id (null after reset) but the chase state stuck
 *  - deathTimeTs lingered after the respawn
 *
 * The new `resetEnemyForRespawn` clears all of it. These tests pin
 * each individual field reset so a future refactor (e.g. the full
 * death-API unification in archwork #2 sub-work #1) can't
 * accidentally re-introduce one of the silent leaks.
 */

const NOW = 1_000_000;

function makeDeadEnemyWithState(): {
  state: ReturnType<typeof createGameState>;
  spatial: SpatialHashGrid;
  enemy: ReturnType<typeof createEnemy>;
} {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const enemy = createEnemy('goblin', 2, { x: 10, y: 0.5, z: 20 }, 1);
  // Simulate "died mid-chase with stale state": all the bookkeeping
  // fields that the prior implementation left untouched on respawn.
  enemy.isAlive = false;
  enemy.health = 0;
  enemy.deathTimeTs = NOW - ENEMY_RESPAWN_DELAY_MS;
  enemy.position = { x: 50, y: 0.5, z: 50 }; // died far from spawn
  enemy.aiState = 'chasing';
  enemy.targetId = 'player-x';
  enemy.velocity = { x: 4, z: -2 };
  enemy.statusEffects = [{ id: 'b1', type: 'burn', value: 1, durationMs: 1000, startTimeTs: NOW - 1, sourceSkill: 'fireball' }];
  enemy.chaseStartedAt = NOW - 5_000;
  enemy.aggroSuppressedUntilTs = NOW - 1_000;
  enemy.patrolTarget = { x: 55, z: 55 };
  enemy.patrolWaitUntilTs = NOW - 100;
  enemy.combatStartedTs = NOW - 6_000;
  enemy.attackCooldown = true;
  enemy.lastAttackTime = NOW - 500;
  state.enemies[enemy.id] = enemy;
  return { state, spatial, enemy };
}

describe('respawnDeadEnemies — basic field reset', () => {
  test('respawning a regular mob clears all chase/patrol bookkeeping', () => {
    const { state, spatial, enemy } = makeDeadEnemyWithState();
    const { sink } = { sink: { publish: vi.fn() } };

    const respawned = respawnDeadEnemies(state, spatial, sink, NOW);

    expect(respawned).toBe(1);
    expect(enemy.isAlive).toBe(true);
    expect(enemy.health).toBe(enemy.maxHealth);
    expect(enemy.position).toEqual(enemy.spawnPosition);

    // The combat/AI bookkeeping must be fully cleared so the new life
    // starts in a deterministic idle state.
    expect(enemy.targetId).toBeNull();
    expect(enemy.aiState).toBe('idle');
    expect(enemy.velocity).toEqual({ x: 0, z: 0 });
    expect(enemy.deathTimeTs).toBeUndefined();
    expect(enemy.lastAttackTime).toBe(0);
    expect(enemy.attackCooldown).toBeUndefined();
    expect(enemy.statusEffects).toEqual([]);
  });

  test('respawn clears chase + patrol + suppression timers', () => {
    const { state, spatial, enemy } = makeDeadEnemyWithState();
    respawnDeadEnemies(state, spatial, { publish: vi.fn() }, NOW);

    expect(enemy.chaseStartedAt).toBeUndefined();
    expect(enemy.aggroSuppressedUntilTs).toBeUndefined();
    expect(enemy.patrolTarget).toBeUndefined();
    expect(enemy.patrolWaitUntilTs).toBeUndefined();
    expect(enemy.combatStartedTs).toBeUndefined();
  });
});

describe('respawnDeadEnemies — mini-boss reset', () => {
  function makeDeadMiniBoss() {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const enemy = createEnemy('dragon', 70, { x: 100, y: 0.5, z: 100 }, 1, {
      isMiniBoss: true,
      bossId: 'vorthax',
    });
    // Simulate a mini-boss killed mid-enrage, mid-phase-shift,
    // mid-signature — every dial flipped.
    enemy.isAlive = false;
    enemy.health = 0;
    // §11 — mini-boss respawn delay is much longer; use the boss-
    // specific constant so the elapsed-time check passes for this
    // fixture.
    enemy.deathTimeTs = NOW - MINI_BOSS_RESPAWN_DELAY_MS;
    enemy.enraged = true;
    enemy.phaseShifted = true;
    enemy.signatureCastingUntilTs = NOW - 200;
    enemy.signatureCastTargetX = 95;
    enemy.signatureCastTargetZ = 95;
    enemy.signatureCastRadius = 12;
    enemy.nextSignatureReadyTs = NOW + 10_000;
    // Enrage + phase doubled the attackDamage / movementSpeed; the
    // base values captured at spawn should restore them.
    enemy.attackDamage = (enemy.baseAttackDamage ?? 100) * 2;
    enemy.movementSpeed = (enemy.baseMovementSpeed ?? 12) * 1.5;
    state.enemies[enemy.id] = enemy;
    return { state, spatial, enemy };
  }

  test('mini-boss respawn clears enrage / phase / signature state', () => {
    const { state, spatial, enemy } = makeDeadMiniBoss();
    respawnDeadEnemies(state, spatial, { publish: vi.fn() }, NOW);

    expect(enemy.enraged).toBeUndefined();
    expect(enemy.phaseShifted).toBeUndefined();
    expect(enemy.signatureCastingUntilTs).toBeUndefined();
    expect(enemy.signatureCastTargetX).toBeUndefined();
    expect(enemy.signatureCastTargetZ).toBeUndefined();
    expect(enemy.signatureCastRadius).toBeUndefined();
    expect(enemy.nextSignatureReadyTs).toBeUndefined();
  });

  test('mini-boss respawn restores attackDamage and movementSpeed from base values', () => {
    const { state, spatial, enemy } = makeDeadMiniBoss();
    const baseDamage = enemy.baseAttackDamage;
    const baseSpeed = enemy.baseMovementSpeed;
    expect(baseDamage).toBeDefined();
    expect(baseSpeed).toBeDefined();
    // Sanity: pre-respawn the buffed values exceeded base.
    expect(enemy.attackDamage).toBeGreaterThan(baseDamage!);
    expect(enemy.movementSpeed).toBeGreaterThan(baseSpeed!);

    respawnDeadEnemies(state, spatial, { publish: vi.fn() }, NOW);

    expect(enemy.attackDamage).toBe(baseDamage);
    expect(enemy.movementSpeed).toBe(baseSpeed);
  });
});

describe('respawnDeadEnemies — guard rails preserved', () => {
  test('does not respawn while the delay has not elapsed', () => {
    const { state, spatial, enemy } = makeDeadEnemyWithState();
    // Delay window not yet over.
    enemy.deathTimeTs = NOW - 100;

    const respawned = respawnDeadEnemies(state, spatial, { publish: vi.fn() }, NOW);
    expect(respawned).toBe(0);
    expect(enemy.isAlive).toBe(false);
  });

  test('does not respawn enemies in inactive zones (regression for pre-rework behaviour)', () => {
    const { state, spatial, enemy } = makeDeadEnemyWithState();
    state.zones.activeZoneIds = ['active-zone'];
    state.zones.enemyZoneIds[enemy.id] = 'inactive-zone';

    const respawned = respawnDeadEnemies(state, spatial, { publish: vi.fn() }, NOW);
    expect(respawned).toBe(0);
    expect(enemy.isAlive).toBe(false);
    expect(enemy.aiState).toBe('chasing'); // unchanged
  });
});
