import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Templar Knight's `Last Stand` (proficiency
// passive at L40) sets `belowHalfHpDamageTakenMultiplier: 0.85`.
// Evaluated live against current HP in `applyCastToTarget` so
// the predicate stays accurate even as the player's HP drops
// mid-fight without a stat recompute.

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
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function makeKnight(specializationId: string | null, hp: number): PlayerState {
  return {
    id: 'knight', socketId: 's', name: 'knight',
    position: { x: 5, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: hp, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'knight', unlockedSkills: [],
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
    getPlayerById: (id: string) => (id === caster.id ? caster : id === target.id ? target : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

describe("Templar Knight Last Stand — 15% damage reduction below half HP", () => {
  it("amplifies survivability vs no spec when the knight is below half HP", () => {
    const caster = makeAttacker();
    const baseline = makeKnight(null, 400); // below half (40%)
    const templar = makeKnight('templar_knight', 400);
    const out: OutboundEventSink = { publish: vi.fn() };

    const baseStart = baseline.health;
    const templarStart = templar.health;
    resolveCastImpact(fireball(caster, baseline), out, worldFor(caster, baseline), Date.now());
    resolveCastImpact(fireball(caster, templar), out, worldFor(caster, templar), Date.now());

    const baseDamage = baseStart - baseline.health;
    const templarDamage = templarStart - templar.health;
    expect(baseDamage).toBeGreaterThan(0);
    expect(templarDamage).toBeCloseTo(baseDamage * 0.85, 0);
  });

  it("does NOT mitigate when the knight is above half HP", () => {
    const caster = makeAttacker();
    const baseline = makeKnight(null, 800); // 80% HP — above the threshold
    const templar = makeKnight('templar_knight', 800);
    const out: OutboundEventSink = { publish: vi.fn() };

    const baseStart = baseline.health;
    const templarStart = templar.health;
    resolveCastImpact(fireball(caster, baseline), out, worldFor(caster, baseline), Date.now());
    resolveCastImpact(fireball(caster, templar), out, worldFor(caster, templar), Date.now());

    expect(baseStart - baseline.health).toBe(templarStart - templar.health);
  });
});
