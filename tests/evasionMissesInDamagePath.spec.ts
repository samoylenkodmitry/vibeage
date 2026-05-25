import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState, type ServerMessage } from '../packages/protocol/messages';
import { getDamage } from '../packages/sim/combatMath';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §52 #6 — misses surface in the combat log. Today the only path
 * that produces a miss is an active `evasion` status effect on the
 * target (buff value as a percent dodge chance). These tests pin:
 *
 *   1. `getDamage` returns `miss: true` and `dmg: 0` when the roll
 *      lands below `targetMissChance`. Independent stream — doesn't
 *      ride on the variance or crit RNG.
 *   2. `resolveCastImpact` propagates the miss outcome:
 *      - target health doesn't move
 *      - skill status effects do NOT apply (a missed cast doesn't
 *        leave a burn/poison/slow behind)
 *      - the emitted `CombatLog` carries `misses: [true]` and
 *        `damages: [0]` so the client can render "X missed Y".
 *
 * Pre-existing damage paths still work when the target has no
 * evasion buff — covered by the existing
 * `lastStandDamageReduction` / `partyDamageAura` suites which would
 * regress here if the miss roll leaked into the no-buff case.
 */

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

function makeDefender(evasionPct: number, durationMs = 60_000): PlayerState {
  const effects = evasionPct > 0 ? [{
    id: 'eva1', type: 'evasion', value: evasionPct,
    durationMs, startTimeTs: Date.now(),
    sourceSkill: 'test:evasion-buff',
  }] : [];
  return {
    id: 'def', socketId: 's', name: 'def',
    position: { x: 5, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'rogue', unlockedSkills: [],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: effects,
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  };
}

function fireballAt(caster: PlayerState, target: PlayerState, castId = 'c-fb'): Cast {
  return {
    castId, casterId: caster.id, skillId: 'fireball',
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
  } as unknown as CombatWorld;
}

describe('getDamage — miss roll', () => {
  it('returns miss=true and dmg=0 when targetMissChance is 1', () => {
    const result = getDamage({
      caster: { dmgMult: 1, critChance: 0, critMult: 2 },
      skill: { base: 50, variance: 0 },
      seed: 'cast-1:target-1',
      targetMissChance: 1,
    });
    expect(result).toEqual({ dmg: 0, crit: false, miss: true });
  });
  it('returns miss=false and normal damage when targetMissChance is 0 (legacy path)', () => {
    const result = getDamage({
      caster: { dmgMult: 1, critChance: 0, critMult: 2 },
      skill: { base: 50, variance: 0 },
      seed: 'cast-1:target-1',
      targetMissChance: 0,
    });
    expect(result.miss).toBe(false);
    expect(result.dmg).toBeGreaterThan(0);
  });
  it('clamps targetMissChance > 1 down to 1 (always-miss)', () => {
    const result = getDamage({
      caster: { dmgMult: 1, critChance: 0, critMult: 2 },
      skill: { base: 50, variance: 0 },
      seed: 'cast-x',
      targetMissChance: 5,
    });
    expect(result.miss).toBe(true);
  });
  it('omits miss flag when targetMissChance is undefined (no opt-in, no roll)', () => {
    const result = getDamage({
      caster: { dmgMult: 1, critChance: 0, critMult: 2 },
      skill: { base: 50, variance: 0 },
      seed: 'cast-1:target-1',
    });
    expect(result.miss).toBe(false);
  });
});

describe('resolveCastImpact — evasion-buff miss in damage path', () => {
  it('skips damage entirely when target has a 95%+ evasion buff and the roll lands below it', () => {
    const caster = makeAttacker();
    // 100% miss chance — clamped to 95% by the resolver, but with
    // `variance: 0` and a fixed seed we only need the roll to be
    // below the (clamped) miss threshold. 95% covers that for
    // every seed the test fires.
    const target = makeDefender(100);
    const startHp = target.health;
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballAt(caster, target), out, worldFor(caster, target));

    expect(target.health).toBe(startHp);
  });

  it('does NOT apply skill status effects on a missed cast', () => {
    const caster = makeAttacker();
    const target = makeDefender(100);
    const beforeEffectCount = target.statusEffects.length;
    const out: OutboundEventSink = { publish: vi.fn() };

    // Fireball carries a burn DOT (per packages/content/skills). A
    // missed cast shouldn't leave the burn on the target.
    resolveCastImpact(fireballAt(caster, target), out, worldFor(caster, target));

    expect(target.statusEffects.length).toBe(beforeEffectCount);
  });

  it('emits CombatLog with misses=[true] and damages=[0] so the client renders the dodge', () => {
    const caster = makeAttacker();
    const target = makeDefender(100);
    const events: OutboundEvent[] = [];
    const out: OutboundEventSink = { publish: (event: OutboundEvent) => events.push(event) };

    resolveCastImpact(fireballAt(caster, target), out, worldFor(caster, target));

    const combatLogs = events
      .filter((e): e is Extract<OutboundEvent, { type: 'serverMessage' }> => e.type === 'serverMessage')
      .map((e) => e.message)
      .filter((m): m is ServerMessage & { type: 'CombatLog' } => m.type === 'CombatLog');
    expect(combatLogs).toHaveLength(1);
    expect(combatLogs[0].damages).toEqual([0]);
    expect(combatLogs[0].misses).toEqual([true]);
  });

  it('takes the normal damage path when target has no evasion buff (no regression)', () => {
    const caster = makeAttacker();
    const target = makeDefender(0);
    const startHp = target.health;
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballAt(caster, target), out, worldFor(caster, target));

    expect(target.health).toBeLessThan(startHp);
  });

  it('does not roll for misses when the evasion buff has expired', () => {
    const caster = makeAttacker();
    // duration 1 — already expired by Date.now() in the next tick.
    const target = makeDefender(100, 0);
    target.statusEffects[0].startTimeTs = Date.now() - 60_000;
    target.statusEffects[0].durationMs = 1_000;
    const startHp = target.health;
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballAt(caster, target), out, worldFor(caster, target));

    expect(target.health).toBeLessThan(startHp);
  });
});
