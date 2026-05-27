import { describe, expect, it } from 'vitest';
import { computeMissChance } from '../packages/sim/combatMath';
import { ACCURACY_BASELINE, EVASION_BASELINE, MAX_DODGE_CHANCE } from '../packages/content/stats';
import { incomingMissChance } from '../server/combat/statusQueries';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { castMobSkill, tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * The base accuracy/evasion stats used to be inert — computed,
 * displayed, and buffed by passives, but read by nothing in combat.
 * `computeMissChance` opposes them against their baselines so they
 * finally bite, while keeping unbuffed combat at 0% miss (no balance
 * shift). Evade-style flat dodge buffs sum on top via
 * `incomingMissChance`.
 */

describe('computeMissChance — accuracy vs evasion', () => {
  it('is 0 at the baselines (no balance regression for unbuffed combat)', () => {
    expect(computeMissChance(ACCURACY_BASELINE, EVASION_BASELINE)).toBe(0);
  });

  it('is 0 whenever accuracy keeps pace with evasion', () => {
    // +20 evasion vs +20 accuracy → deltas cancel → no dodge.
    expect(computeMissChance(ACCURACY_BASELINE + 20, EVASION_BASELINE + 20)).toBe(0);
    // More accuracy than evasion → still 0 (never negative).
    expect(computeMissChance(ACCURACY_BASELINE + 50, EVASION_BASELINE + 10)).toBe(0);
  });

  it('each net evasion point above the attacker is +1% dodge', () => {
    // +25 evasion, baseline accuracy → 25% dodge.
    expect(computeMissChance(ACCURACY_BASELINE, EVASION_BASELINE + 25)).toBeCloseTo(0.25, 5);
    // Attacker accuracy claws some back: +25 evasion, +10 accuracy → 15%.
    expect(computeMissChance(ACCURACY_BASELINE + 10, EVASION_BASELINE + 25)).toBeCloseTo(0.15, 5);
  });

  it('caps at MAX_DODGE_CHANCE', () => {
    expect(computeMissChance(ACCURACY_BASELINE, EVASION_BASELINE + 1000)).toBe(MAX_DODGE_CHANCE);
  });

  it('treats a missing accuracy stat as the baseline (neutral attacker)', () => {
    expect(incomingMissChance(undefined, makeTarget(EVASION_BASELINE), Date.now())).toBe(0);
    expect(incomingMissChance(undefined, makeTarget(EVASION_BASELINE + 30), Date.now())).toBeCloseTo(0.30, 5);
  });
});

function makeTarget(evasion: number): PlayerState {
  return {
    id: 't', socketId: 's', name: 't',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 0, maxMana: 0,
    className: 'rogue', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 1, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    stats: { evasion },
  };
}

describe('base evasion stat dodges mob swings (through the cast path)', () => {
  const SPAWN_TS = 1_700_000_000_000;
  // Count mob mobStrike swings that the target dodges (HP unchanged), over
  // `ticks` deterministic timestamps. Drives the live cast pipeline so the
  // stat-based dodge is exercised exactly where mobs deal damage.
  function dodges(target: PlayerState, ticks: number): number {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const enemy = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, SPAWN_TS);
    enemy.id = 'goblin-test';
    enemy.stats = { ...enemy.stats, attackPower: 100 };
    state.enemies[enemy.id] = enemy; spatial.insert(enemy.id, { x: 1, z: 0 });
    target.health = target.maxHealth = 1_000_000; // survive every hit so we can count all misses
    state.players[target.id] = target; spatial.insert(target.id, { x: 0, z: 0 });
    const outbound: OutboundEventSink = { publish: () => undefined };
    const world = createWorldCombatBridge(state, outbound, spatial);
    let misses = 0;
    for (let i = 0; i < ticks; i += 1) {
      const now = SPAWN_TS + i * 2_000;
      const hp = target.health;
      castMobSkill(enemy, target, 'mobStrike', now, { world, activeCasts: state.activeCasts, outbound });
      tickCasts(state.activeCasts, 50, outbound, world, now);
      if (target.health === hp) misses += 1;
    }
    return misses;
  }

  it('a high evasion stat produces dodges; baseline evasion never does', () => {
    expect(dodges(makeTarget(EVASION_BASELINE + 40), 30)).toBeGreaterThan(0);
    expect(dodges(makeTarget(EVASION_BASELINE), 30)).toBe(0); // baseline = no balance shift
  });
});
