import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { castMobSkill, tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

const player = (id: string, x: number, z: number): PlayerState => ({
  id, socketId: id, name: id, position: { x, y: 0.5, z }, rotation: { x: 0, y: 0, z: 0 },
  health: 1000, maxHealth: 1000, mana: 100, maxMana: 100, className: 'mage', unlockedSkills: [],
  availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [], level: 5, experience: 0,
  experienceToNextLevel: 100, castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
} as unknown as PlayerState);

/**
 * A1.3 — telegraphed delivery: a mobBreath (cone) locks its origin +
 * direction at cast start, shows a telegraph, and resolves the cone at
 * the LOCKED origin after the wind-up — even if the caster has moved.
 */
describe('telegraphed cone ability', () => {
  function setup() {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const enemy = createEnemy('goblin', 5, { x: 0, y: 0.5, z: 0 }, NOW);
    enemy.stats = { ...enemy.stats, attackPower: 80 };
    const inCone = player('inCone', 6, 0);   // +X, toward the target → inside the wedge
    const behind = player('behind', -6, 0);  // opposite side → outside
    state.enemies[enemy.id] = enemy;
    for (const p of [inCone, behind]) { state.players[p.id] = p; spatial.insert(p.id, { x: p.position.x, z: p.position.z }); }
    spatial.insert(enemy.id, { x: 0, z: 0 });
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => events.push(e) };
    const world = createWorldCombatBridge(state, outbound, spatial);
    return { state, spatial, enemy, inCone, behind, events, outbound, world };
  }

  it('emits a telegraph at cast start and uses the wind-up as the cast time', () => {
    const { enemy, inCone, events, outbound, world, state } = setup();
    castMobSkill(enemy, inCone, 'mobBreath', NOW, { world, activeCasts: state.activeCasts, outbound });
    const telegraph = events.find((e) => e.type === 'serverMessage' && e.message.type === 'BossTelegraph');
    expect(telegraph, 'a telegraph warning is emitted').toBeDefined();
    const cast = Object.values(state.activeCasts)[0];
    expect(cast.castTimeMs).toBe(1200);      // wind-up, not the skill's castMs
    expect(cast.shapeOrigin).toEqual({ x: 0, z: 0 }); // locked at the caster's cast-start position
  });

  it('resolves the cone at the locked origin after the wind-up — caster movement does not shift it', () => {
    const { enemy, inCone, behind, outbound, world, state } = setup();
    castMobSkill(enemy, inCone, 'mobBreath', NOW, { world, activeCasts: state.activeCasts, outbound });
    // Boss wanders off mid wind-up; the telegraphed cone must still land where drawn.
    enemy.position = { x: 50, y: 0.5, z: 50 };
    tickCasts(state.activeCasts, 100, outbound, world, NOW + 1200);
    expect(inCone.health, 'target in the cone wedge is hit').toBeLessThan(1000);
    expect(behind.health, 'player behind the caster is spared').toBe(1000);
  });
});
