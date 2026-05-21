import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import {
  EFFECT_SPECS,
  getMaxStacks,
  getStackingPolicy,
} from '../packages/content/effects';
import type { SkillId } from '../packages/content/skills';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §46/slice-2 — per-effect stacking policy declared in EFFECT_SPECS
// and consumed by impactResolver.upsertStatusEffect.

function makeCaster(id = 'attacker', specializationId: string | null = null): PlayerState {
  return {
    id, socketId: `${id}-s`, name: id,
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: ['poisonBlade', 'bless', 'fireball'],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 1, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function worldFor(caster: PlayerState, target: PlayerState | ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => ((target as { id: string }).id === id && !('socketId' in target) ? (target as ReturnType<typeof createEnemy>) : null),
    getPlayerById: (id) => {
      if (id === caster.id) return caster;
      if ('socketId' in target && (target as PlayerState).id === id) return target as PlayerState;
      return null;
    },
    getEntitiesInCircle: () => [target as PlayerState | ReturnType<typeof createEnemy>],
    onTargetDied: vi.fn(),
  };
}

function castSkill(skillId: SkillId, casterId: string, targetId: string | null, suffix = ''): Cast {
  return {
    castId: `c-${skillId}-${suffix || Math.random().toString(36).slice(2, 8)}`,
    casterId, skillId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 }, pos: { x: 0, z: 0 },
    startedAt: Date.now(), castTimeMs: 0,
    ...(targetId ? { targetId } : {}),
  };
}

describe('EFFECT_SPECS stacking policy declarations', () => {
  it('every effect type declares a stacking policy explicitly', () => {
    for (const [type, spec] of Object.entries(EFFECT_SPECS)) {
      expect(spec.stacking, `${type} must declare a stacking policy`).toBeDefined();
    }
  });

  it('DoT-shaped effects all use `stack` with maxStacks > 1', () => {
    for (const type of ['dot', 'burn', 'poison'] as const) {
      expect(getStackingPolicy(type)).toBe('stack');
      expect(getMaxStacks(type)).toBeGreaterThan(1);
    }
  });

  it('crowd-control + buffs default to `refresh` (single-instance, re-cast for upkeep)', () => {
    for (const type of ['stun', 'slow', 'freeze', 'shield', 'bless', 'evasion', 'invisible', 'taunt'] as const) {
      expect(getStackingPolicy(type)).toBe('refresh');
    }
  });

  it('instant effects default to `replace` (no duration to merge)', () => {
    for (const type of ['damage', 'heal', 'dispel', 'knockback', 'aggroReset', 'teleport'] as const) {
      expect(getStackingPolicy(type)).toBe('replace');
    }
  });
});

describe('upsertStatusEffect — stack policy (poison via poisonBlade)', () => {
  it('bumps stacks on each re-application up to maxStacks', () => {
    const caster = makeCaster();
    const target = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, Date.now());
    target.health = 10_000; // never dies during the test
    const out: OutboundEventSink = { publish: vi.fn() };

    for (let i = 0; i < 5; i++) {
      target.health = 10_000;
      resolveCastImpact(castSkill('poisonBlade', caster.id, target.id, `${i}`), out, worldFor(caster, target));
    }

    const poisons = (target.statusEffects ?? []).filter((e) => e.type === 'poison');
    expect(poisons).toHaveLength(1);
    expect(poisons[0].stacks).toBe(getMaxStacks('poison')); // capped, 3 today
  });
});

describe('upsertStatusEffect — refresh policy (bless self-cast)', () => {
  it('keeps existing value, extends duration, resets start time', async () => {
    const caster = makeCaster();
    // Bless targets self (no requiresTarget). Cast once, then again
    // 100ms later. The second cast should refresh, not replace.
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(castSkill('bless', caster.id, null, '1'), out, worldFor(caster, caster));
    const first = caster.statusEffects.find((e) => e.type === 'bless')!;
    const firstStart = first.startTimeTs!;
    const firstValue = first.value;

    await new Promise((r) => setTimeout(r, 10));

    resolveCastImpact(castSkill('bless', caster.id, null, '2'), out, worldFor(caster, caster));
    const refreshed = caster.statusEffects.find((e) => e.type === 'bless')!;

    expect(caster.statusEffects.filter((e) => e.type === 'bless')).toHaveLength(1);
    expect(refreshed.value).toBe(firstValue); // value preserved
    expect(refreshed.startTimeTs!).toBeGreaterThan(firstStart); // start reset
  });
});
