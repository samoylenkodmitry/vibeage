import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Phoenix Knight `Resurrection` proficiency
// passive: the first hit each life that would kill the player
// instead leaves them at 1 HP for 2.5s of invuln.

function makeAttacker(): PlayerState {
  return {
    id: 'atk', socketId: 's', name: 'atk',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: ['fireball'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    stats: { dmgMult: 50, critChance: 0, critMult: 2 }, // huge dmg so the hit one-shots
  };
}

function makeKnight(specializationId: string | null): PlayerState {
  return {
    id: 'knight', socketId: 's', name: 'knight',
    position: { x: 5, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 50, maxHealth: 200, mana: 100, maxMana: 100,
    className: 'paladin', unlockedSkills: [],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: PROFICIENCY_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
  };
}

function fireball(caster: PlayerState, target: PlayerState): Cast {
  return {
    castId: 'c-fb', casterId: caster.id, skillId: 'fireball',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

function worldFor(caster: PlayerState, target: PlayerState): CombatWorld {
  return {
    getEnemyById: () => null,
    getPlayerById: (id) => (id === caster.id ? caster : id === target.id ? target : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

describe('Phoenix Knight Resurrection — once-per-life killing-hit save', () => {
  it('saves a Phoenix Knight from a one-shot, leaves them at 1 HP, and applies invuln', () => {
    const caster = makeAttacker();
    const phoenix = makeKnight('phoenix_knight');
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireball(caster, phoenix), out, worldFor(caster, phoenix), Date.now());

    expect(phoenix.health).toBe(1);
    expect(phoenix.isAlive).toBe(true);
    expect(phoenix.usedResurrectionThisLife).toBe(true);
    expect(phoenix.statusEffects?.some((e) => e.type === 'invuln')).toBe(true);
  });

  it('second killing hit during the same life kills normally', () => {
    const caster = makeAttacker();
    const phoenix = makeKnight('phoenix_knight');
    phoenix.usedResurrectionThisLife = true; // pretend a prior save burned it
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireball(caster, phoenix), out, worldFor(caster, phoenix), Date.now());

    expect(phoenix.health).toBe(0);
  });

  it('an unspecced paladin one-shots normally', () => {
    const caster = makeAttacker();
    const baseline = makeKnight(null);
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireball(caster, baseline), out, worldFor(caster, baseline), Date.now());

    expect(baseline.health).toBe(0);
  });
});
