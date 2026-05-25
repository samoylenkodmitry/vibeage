import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { PROFICIENCY_LEVEL, SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — caster's spec passive can boost damage on
// the cast's flavoured element. Pyromancer (fire) amplifies
// fireball / meteor; Phoenix Knight (holy) amplifies smite.
// Verified by comparing same-seed casts: with vs without spec.

function makePlayer(specializationId: string | null, className: PlayerState['className'], level: number): PlayerState {
  return {
    id: 'p', socketId: 's', name: 'p',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className, unlockedSkills: ['fireball', 'smite'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function cast(skillId: 'fireball' | 'smite', caster: PlayerState, target: { id: string; position: { x: number; z: number } }): Cast {
  return {
    castId: `c-${skillId}`, casterId: caster.id, skillId,
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

function worldFor(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

function damageFromLog(events: OutboundEvent[]): number {
  for (const e of events) {
    const w = e as { type?: string; message?: { type?: string; damages?: number[] } };
    if (w.type !== 'serverMessage') continue;
    if (w.message?.type !== 'CombatLog') continue;
    if (!w.message.damages?.length) continue;
    return w.message.damages.reduce((a, b) => a + b, 0);
  }
  return 0;
}

describe('damage-element amplifier from spec passives', () => {
  it('Pyromancer at L20 lands +20% fireball damage vs unspecced mage', () => {
    const baseline = makePlayer(null, 'mage', SPECIALIZATION_UNLOCK_LEVEL);
    const pyro = makePlayer('pyromancer', 'mage', SPECIALIZATION_UNLOCK_LEVEL);
    const targetA = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());
    const targetB = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now() + 1);

    // Same seed: cast id + target id determine the variance roll;
    // we use one target instance per cast but same castId, AND
    // reset HP between casts (Pyromancer + baseline use DIFFERENT
    // targets so each enemy keeps its own seed — for a strict
    // ratio comparison reset HP on the SAME enemy.
    targetA.health = targetA.maxHealth;
    targetB.health = targetB.maxHealth;
    const e1: OutboundEvent[] = []; const e2: OutboundEvent[] = [];
    // Re-target the same enemy id for both casts so seeds match.
    resolveCastImpact(cast('fireball', baseline, targetA), { publish: (e) => e1.push(e) }, worldFor(baseline, targetA));
    targetA.health = targetA.maxHealth;
    resolveCastImpact(cast('fireball', pyro, targetA), { publish: (e) => e2.push(e) }, worldFor(pyro, targetA));

    const baseDmg = damageFromLog(e1);
    const ampDmg = damageFromLog(e2);
    expect(baseDmg).toBeGreaterThan(0);
    // Pyromancer's damageMultiplier (1.1) AND damageElementMultiplier
    // (fire: 1.2) both apply. Net: 1.1 × 1.2 = 1.32. The damageMul
    // is in caster.stats which we don't update here, so only the
    // element bonus shows up → 1.2.
    expect(ampDmg / baseDmg).toBeCloseTo(1.2, 4);
  });

  it('a non-fire cast (smite) is unaffected by Pyromancer', () => {
    const baseline = makePlayer(null, 'paladin', SPECIALIZATION_UNLOCK_LEVEL);
    // Pyromancer is a mage spec; can't equip on paladin. Use it
    // anyway via the modifier — calculateDamage doesn't gate on
    // class match, only on the cast's damageElement === 'fire'.
    const pyro = makePlayer('pyromancer', 'paladin', SPECIALIZATION_UNLOCK_LEVEL);
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());

    const e1: OutboundEvent[] = []; const e2: OutboundEvent[] = [];
    resolveCastImpact(cast('smite', baseline, target), { publish: (e) => e1.push(e) }, worldFor(baseline, target));
    target.health = target.maxHealth;
    resolveCastImpact(cast('smite', pyro, target), { publish: (e) => e2.push(e) }, worldFor(pyro, target));

    expect(damageFromLog(e1)).toBe(damageFromLog(e2));
  });

  it('Conflagration stacks +15% on Kindling +20% at proficiency level', () => {
    const baseline = makePlayer(null, 'mage', PROFICIENCY_LEVEL);
    const pyro = makePlayer('pyromancer', 'mage', PROFICIENCY_LEVEL);
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());

    const e1: OutboundEvent[] = []; const e2: OutboundEvent[] = [];
    resolveCastImpact(cast('fireball', baseline, target), { publish: (e) => e1.push(e) }, worldFor(baseline, target));
    target.health = target.maxHealth;
    resolveCastImpact(cast('fireball', pyro, target), { publish: (e) => e2.push(e) }, worldFor(pyro, target));

    // Spec ×1.2 stacked with proficiency ×1.15 = 1.38.
    expect(damageFromLog(e2) / damageFromLog(e1)).toBeCloseTo(1.38, 4);
  });
});
