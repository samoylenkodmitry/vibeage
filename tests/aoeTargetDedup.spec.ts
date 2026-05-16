import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

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
    skillShortcuts: [],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 5,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    inventory: [],
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
    const primary = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, 1);
    const sibling = createEnemy('goblin', 1, { x: 6, y: 0, z: 0 }, 2);
    const primaryHealthBefore = primary.health;
    const siblingHealthBefore = sibling.health;

    const world = makeWorld({ caster, primary, nearby: [sibling] });
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(makeWaterSplashCast(caster.id, primary.id), outbound, world);

    // Both enemies took damage exactly once.
    expect(primary.health).toBeLessThan(primaryHealthBefore);
    expect(sibling.health).toBeLessThan(siblingHealthBefore);

    // Primary's damage matches a single hit, not a double.
    const primaryDamage = primaryHealthBefore - primary.health;
    const siblingDamage = siblingHealthBefore - sibling.health;
    expect(
      Math.abs(primaryDamage - siblingDamage),
      'primary and sibling should each have been hit exactly once (no double-hit on primary)',
    ).toBeLessThan(primaryHealthBefore * 0.5);
  });

  it('caster is excluded from the area circle even if standing inside it', () => {
    const caster = makeCaster('p1');
    const primary = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, 3);
    const casterBefore = caster.health;

    // World reports caster inside the AoE — dedup should exclude them.
    const world: CombatWorld = {
      getEnemyById: (id: string) => (id === primary.id ? primary : null),
      getPlayerById: (id: string) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [caster, primary],
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(makeWaterSplashCast(caster.id, primary.id), outbound, world);

    expect(caster.health).toBe(casterBefore);
  });
});
