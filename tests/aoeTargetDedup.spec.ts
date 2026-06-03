import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import { SKILLS } from '../packages/content/skills';

const NOW = 1_700_000_000_000;

function makeCaster(id: string): PlayerState {
  return {
    id,
    socketId: `${id}-s`,
    name: id,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'mage',
    unlockedSkills: ['waterSplash'],

    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 5,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

function makeWorld(opts: {
  caster: PlayerState;
  primary: ReturnType<typeof createEnemy>;
  nearby: Array<ReturnType<typeof createEnemy>>;
}): CombatWorld {
  const all = [opts.primary, ...opts.nearby];
  return {
    getEnemyById: (id: string) => all.find(e => e.id === id) ?? null,
    getPlayerById: (id: string) => (id === opts.caster.id ? opts.caster : null),
    getEntitiesInCircle: () => all,
    onTargetDied: vi.fn(),
  };
}

function makeWaterSplashCast(casterId: string, primaryTargetId: string): Cast {
  return {
    castId: 'c1',
    casterId,
    skillId: 'waterSplash',
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 5, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
    targetId: primaryTargetId,
  };
}

describe('AoE target dedup (Section 8 L536)', () => {
  it('primary target hit by an explicit targetId is not also damaged via the area circle', () => {
    const caster = makeCaster('p1');
    // createEnemy(type, level, position, now) — last arg is timestamp, not an id.
    const primary = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW);
    const sibling = createEnemy('goblin', 1, { x: 6, y: 0, z: 0 }, NOW);
    const primaryHealthBefore = primary.health;
    const siblingHealthBefore = sibling.health;

    const world = makeWorld({ caster, primary, nearby: [sibling] });
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(makeWaterSplashCast(caster.id, primary.id), outbound, world, NOW);

    // Both enemies took damage exactly once.
    expect(primary.health).toBeLessThan(primaryHealthBefore);
    expect(sibling.health).toBeLessThan(siblingHealthBefore);

    // Primary's damage matches a single hit, not a double.
    const primaryDamage = primaryHealthBefore - primary.health;
    const siblingDamage = siblingHealthBefore - sibling.health;
    // Damage variance is 10%; two single hits should differ by less than
    // ~20% of one hit. A double-hit on the primary would be ~2× sibling,
    // a 100% gap — well outside this bound.
    expect(
      Math.abs(primaryDamage - siblingDamage),
      `primary and sibling should each have been hit exactly once. ` +
      `primary=${primaryDamage}, sibling=${siblingDamage}`,
    ).toBeLessThan(siblingDamage * 0.2);
  });

  it('centers targeted instant AoE on the resolved target point, not the caster', () => {
    const caster = makeCaster('p1');
    const primary = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW);
    const sibling = createEnemy('goblin', 1, { x: 6, y: 0, z: 0 }, NOW);
    const getEntitiesInCircle = vi.fn((center: { x: number; z: number }, radius: number) => {
      if (radius === 3) return [primary, sibling];
      return [];
    });
    const world: CombatWorld = {
      getEnemyById: (id: string) => (id === primary.id ? primary : null),
      getPlayerById: (id: string) => (id === caster.id ? caster : null),
      getEntitiesInCircle,
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };
    const cast = { ...makeWaterSplashCast(caster.id, primary.id), target: { x: 5, z: 0 } };

    resolveCastImpact(cast, outbound, world, NOW);

    expect(getEntitiesInCircle).toHaveBeenCalledWith({ x: 5, z: 0 }, 3);
    expect(sibling.health).toBeLessThan(sibling.maxHealth);
  });

  it('keeps non-target-required area circles centered on the cast position', () => {
    const caster = makeCaster('p1');
    const getEntitiesInCircle = vi.fn(() => []);
    const world: CombatWorld = {
      getEnemyById: () => null,
      getPlayerById: (id: string) => (id === caster.id ? caster : null),
      getEntitiesInCircle,
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };
    const cast: Cast = {
      castId: 'meteor-cast',
      casterId: caster.id,
      skillId: 'meteor',
      state: CastState.Impact,
      origin: { x: 0, z: 0 },
      pos: { x: 1, z: 0 },
      target: { x: 20, z: 0 },
      startedAt: NOW,
      castTimeMs: 0,
    };

    resolveCastImpact(cast, outbound, world, NOW);

    expect(getEntitiesInCircle).toHaveBeenCalledWith({ x: 1, z: 0 }, SKILLS.meteor.area);
  });

  it('caster is excluded from the area circle even if standing inside it', () => {
    const caster = makeCaster('p1');
    const primary = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW);
    const casterBefore = caster.health;

    // World reports caster inside the AoE — dedup should exclude them.
    const world: CombatWorld = {
      getEnemyById: (id: string) => (id === primary.id ? primary : null),
      getPlayerById: (id: string) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [caster, primary],
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(makeWaterSplashCast(caster.id, primary.id), outbound, world, NOW);

    expect(caster.health).toBe(casterBefore);
  });
});
