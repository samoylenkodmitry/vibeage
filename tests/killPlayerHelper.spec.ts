import { describe, expect, it, vi } from 'vitest';
import { killPlayer } from '../server/players/playerLifecycle';
import { applyEnemyAttack } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  DOT_TICK_INTERVAL_MS,
  tickDamageOverTimeEffects,
} from '../server/combat/dotTicker';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { StatusEffect } from '../packages/protocol/messages';

/**
 * Archwork item #2 sub-work 1 — unified `killPlayer` helper.
 *
 * Before this rework the death-state mutations were duplicated
 * across enemyBehavior.applyEnemyAttack, enemyStateMachine boss
 * signature damage, and dotTicker (no cleanup at all for player
 * DoT deaths). One central helper means the shape stays identical
 * for every kill path.
 *
 * Pin both the helper itself AND each call site so a future
 * refactor of cast bookkeeping can't silently lose cleanup at one
 * of the three death seams.
 */

const NOW = 1_700_000_000_000;

function burnEffect(value: number, overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: `b-${Math.random().toString(36).slice(2, 7)}`,
    type: 'burn',
    value,
    durationMs: 10_000,
    startTimeTs: NOW,
    sourceSkill: 'fireball',
    ...overrides,
  };
}

describe('killPlayer helper', () => {
  it('flips death state and clears pre-death intent', () => {
    const player = createTransientPlayer('s1', 'tester');
    player.health = 5;
    // Pre-death state the new life should NOT inherit.
    player.targetId = 'some-enemy';
    player.castingSkill = 'fireball';
    player.castingProgressMs = 120;

    const killed = killPlayer(player, NOW);

    expect(killed).toBe(true);
    expect(player.isAlive).toBe(false);
    expect(player.health).toBe(0);
    expect(player.deathTimeTs).toBe(NOW);
    expect(player.targetId).toBeNull();
    expect(player.castingSkill).toBeNull();
    expect(player.castingProgressMs).toBe(0);
  });

  it('idempotent on an already-dead player (safe to call from multiple seams)', () => {
    const player = createTransientPlayer('s1', 'tester');
    player.isAlive = false;
    player.deathTimeTs = NOW - 1_000;
    player.health = 0;

    const killed = killPlayer(player, NOW);

    expect(killed).toBe(false);
    // Original deathTimeTs not overwritten by the second call.
    expect(player.deathTimeTs).toBe(NOW - 1_000);
  });
});

describe('applyEnemyAttack (normal enemy → player) routes through killPlayer', () => {
  it('killed player ends up in the canonical death-state shape', () => {
    const player = createTransientPlayer('s1', 'victim');
    player.health = 5;
    player.targetId = 'mob-1';
    player.castingSkill = 'fireball';
    player.castingProgressMs = 80;
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    enemy.attackDamage = 50;
    enemy.lastAttackTime = 0;
    // Guarantee the swing lands — this test pins the death-state shape,
    // not the dodge roll. A real (full-stat) player has a few % base
    // evasion vs a baseline-accuracy mob, which would otherwise flake.
    enemy.stats = { ...enemy.stats, accuracy: 10_000 };

    const result = applyEnemyAttack(enemy, player, NOW);

    expect(result?.killed).toBe(true);
    expect(player.isAlive).toBe(false);
    expect(player.targetId).toBeNull();
    expect(player.castingSkill).toBeNull();
    expect(player.castingProgressMs).toBe(0);
  });
});

describe('dotTicker (player DoT death) routes through killPlayer', () => {
  it('player killed by a DoT tick has cleared cast / target state', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('s1', 'victim');
    player.health = 2;
    player.targetId = 'tracked-enemy';
    player.castingSkill = 'fireball';
    player.castingProgressMs = 200;
    player.statusEffects = [burnEffect(99)];
    state.players[player.id] = player;

    const sink: OutboundEventSink = { publish: vi.fn() };
    tickDamageOverTimeEffects(state, spatial, sink, NOW + DOT_TICK_INTERVAL_MS);

    expect(player.isAlive).toBe(false);
    // The whole point of the unified killPlayer — these fields used
    // to linger because dotTicker only flipped isAlive=false.
    expect(player.targetId).toBeNull();
    expect(player.castingSkill).toBeNull();
    expect(player.castingProgressMs).toBe(0);
  });
});
