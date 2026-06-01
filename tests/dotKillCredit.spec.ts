import { describe, expect, it, vi } from 'vitest';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  DOT_TICK_INTERVAL_MS,
  tickDamageOverTimeEffects,
} from '../server/combat/dotTicker';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { StatusEffect } from '../packages/protocol/messages';

/**
 * Archwork item #2 sub-work 3 — DoT kill credit.
 *
 * When a damage-over-time tick kills an enemy, the caster who
 * applied the DoT must receive the same kill rewards (XP, quest
 * progress, loot) as if they'd landed a direct-damage finisher.
 * Pre-rework the dotTicker only flipped `isAlive = false` and
 * called it done — silent reward loss.
 *
 * The bridge: `StatusEffect.sourceCasterId` (added in archwork
 * sub-work 2) is the link; `handleTargetDeath(caster, enemy, ctx)`
 * is the canonical death seam. tickDamageOverTimeEffects looks up
 * the caster in state.players and routes the kill through it.
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

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => { events.push(e); } } };
}

describe('tickDamageOverTimeEffects — DoT kill credit', () => {
  it('a DoT-killed enemy credits XP to the sourceCasterId player', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const caster = createTransientPlayer('socket-caster', 'CasterMage');
    state.players[caster.id] = caster;
    const startExp = caster.experience;

    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    enemy.health = 5; // lethal in one burn tick
    enemy.statusEffects = [burnEffect(50, { sourceCasterId: caster.id })];
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });

    const { sink } = captureOutbound();

    tickDamageOverTimeEffects(state, spatial, sink, NOW + DOT_TICK_INTERVAL_MS);

    expect(enemy.isAlive).toBe(false);
    // XP credited to the original caster, exactly as if they'd
    // landed a direct-damage finisher.
    expect(caster.experience).toBeGreaterThan(startExp);
    expect(caster.experience).toBe(startExp + enemy.baseExperienceValue);
  });

  it('removes the DoT-killed enemy from the spatial grid', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const caster = createTransientPlayer('socket-caster', 'CasterMage');
    state.players[caster.id] = caster;

    const enemy = createEnemy('goblin', 1, { x: 7, y: 0.5, z: -3 }, 1);
    enemy.health = 1;
    enemy.statusEffects = [burnEffect(99, { sourceCasterId: caster.id })];
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 7, z: -3 });

    expect(spatial.queryCircle({ x: 7, z: -3 }, 1)).toContain(enemy.id);

    tickDamageOverTimeEffects(state, spatial, { publish: vi.fn() }, NOW + DOT_TICK_INTERVAL_MS);

    expect(enemy.isAlive).toBe(false);
    expect(spatial.queryCircle({ x: 7, z: -3 }, 1)).not.toContain(enemy.id);
  });

  it('an unowned DoT (no sourceCasterId) still kills but does not award XP (graceful fallback)', () => {
    // Pre-rework DoTs or system-applied debuffs (e.g. an environment
    // hazard) have no caster id. The enemy still dies — we don't
    // want to leave it alive — but no player gets credit.
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const caster = createTransientPlayer('socket-caster', 'CasterMage');
    state.players[caster.id] = caster;
    const startExp = caster.experience;

    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    enemy.health = 1;
    // No sourceCasterId — legacy / system-applied.
    enemy.statusEffects = [burnEffect(99)];
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });

    tickDamageOverTimeEffects(state, spatial, { publish: vi.fn() }, NOW + DOT_TICK_INTERVAL_MS);

    expect(enemy.isAlive).toBe(false);
    expect(caster.experience).toBe(startExp);
  });

  it('the caster not being in state.players is non-fatal (legacy fallback to plain death)', () => {
    // A DoT applied by a caster who has since disconnected: the
    // enemy dies normally without credit, no crash.
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    enemy.health = 1;
    enemy.statusEffects = [burnEffect(99, { sourceCasterId: 'disconnected-ghost' })];
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });

    expect(() =>
      tickDamageOverTimeEffects(state, spatial, { publish: vi.fn() }, NOW + DOT_TICK_INTERVAL_MS),
    ).not.toThrow();
    expect(enemy.isAlive).toBe(false);
  });
});

describe('tickDamageOverTimeEffects — DoT death broadcast', () => {
  it('broadcasts the enemy death so clients stop showing a DoT-killed enemy alive', () => {
    // Regression: handleTargetDeath flips isAlive server-side but does not emit;
    // the dotTicker must broadcast the death itself or clients keep rendering
    // the poison-killed enemy as alive.
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const caster = createTransientPlayer('socket-caster', 'CasterMage');
    state.players[caster.id] = caster;

    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, 1);
    enemy.health = 5;
    enemy.statusEffects = [burnEffect(50, { sourceCasterId: caster.id })];
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });

    const { events, sink } = captureOutbound();
    tickDamageOverTimeEffects(state, spatial, sink, NOW + DOT_TICK_INTERVAL_MS);

    const deathEvent = events.find(
      (e) => e.type === 'enemyUpdated' && e.update.id === enemy.id && e.update.isAlive === false,
    );
    expect(deathEvent).toBeDefined();
  });
});
