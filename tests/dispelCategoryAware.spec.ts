import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { dispelTargetSet } from '../server/combat/statusQueries';
import { CastState } from '../packages/protocol/messages';
import { SKILLS, type SkillEffect } from '../packages/content/skills';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §52 #10 — category-aware dispel. The `dispel` skill effect now
 * carries an optional `dispelCategory`. Default 'negative' preserves
 * the pre-§52 behavior (strips the fixed debuff set). Other
 * categories let designers ship targeted purges without a protocol
 * change.
 *
 * Two layers of test:
 *   1. `dispelTargetSet(category)` returns the correct effect-type
 *      set for each category — the static contract.
 *   2. `resolveCastImpact` with a content skill that mutates the
 *      dispel category through `SKILLS.dispel.effects[0]` filters
 *      target's statusEffects to the right shape end-to-end.
 */

describe('dispelTargetSet — static category → effect-type map', () => {
  it('negative covers the pre-§52 fixed set', () => {
    const set = dispelTargetSet('negative');
    for (const type of ['slow', 'stun', 'burn', 'poison', 'dot', 'freeze', 'waterWeakness']) {
      expect(set.has(type)).toBe(true);
    }
    // Sanity: buffs are not in the negative set.
    expect(set.has('heal')).toBe(false);
    expect(set.has('shield')).toBe(false);
  });
  it('positive covers buffs (heal, shield, bless, evasion, invisible)', () => {
    const set = dispelTargetSet('positive');
    for (const type of ['heal', 'shield', 'bless', 'evasion', 'invisible']) {
      expect(set.has(type)).toBe(true);
    }
    expect(set.has('stun')).toBe(false);
  });
  it('poison strips poison + generic dot but leaves stuns + burns', () => {
    const set = dispelTargetSet('poison');
    expect(set.has('poison')).toBe(true);
    expect(set.has('dot')).toBe(true);
    expect(set.has('burn')).toBe(false);
    expect(set.has('stun')).toBe(false);
  });
  it('stun strips action-blockers (stun, freeze, root)', () => {
    const set = dispelTargetSet('stun');
    expect(set.has('stun')).toBe(true);
    expect(set.has('freeze')).toBe(true);
    expect(set.has('root')).toBe(true);
    expect(set.has('slow')).toBe(false);
  });
  it('shield strips damage-absorb shields only', () => {
    const set = dispelTargetSet('shield');
    expect(set.has('shield')).toBe(true);
    expect(set.size).toBe(1);
  });
  it('bleed + magic are reserved (empty sets) — content can populate later', () => {
    expect(dispelTargetSet('bleed').size).toBe(0);
    expect(dispelTargetSet('magic').size).toBe(0);
  });
});

function makeCaster(): PlayerState {
  return {
    id: 'caster', socketId: 's', name: 'caster',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'healer', unlockedSkills: ['dispel'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 6, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  };
}

function dispelCast(caster: PlayerState, target: PlayerState): Cast {
  return {
    castId: 'c-disp', casterId: caster.id, skillId: 'dispel',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0, targetId: target.id,
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

function withDispelCategory(category: SkillEffect['dispelCategory']): () => void {
  const original = SKILLS.dispel.effects[0].dispelCategory;
  SKILLS.dispel.effects[0].dispelCategory = category;
  return () => { SKILLS.dispel.effects[0].dispelCategory = original; };
}

function statusEffect(type: string, value = 5): { id: string; type: string; value: number; durationMs: number; startTimeTs: number; sourceSkill: string } {
  return { id: `${type}-1`, type, value, durationMs: 30_000, startTimeTs: Date.now(), sourceSkill: 'test' };
}

function runDispelWith(
  category: SkillEffect['dispelCategory'] | undefined,
  targetEffects: string[],
): string[] {
  const caster = makeCaster();
  const target = makeCaster();
  target.id = 'target';
  target.statusEffects = targetEffects.map((t) => statusEffect(t));
  const noop = (): void => undefined;
  const restore = category ? withDispelCategory(category) : noop;
  try {
    const out: OutboundEventSink = { publish: vi.fn() };
    resolveCastImpact(dispelCast(caster, target), out, worldFor(caster, target), Date.now());
  } finally {
    restore();
  }
  return target.statusEffects.map((e) => e.type).sort();
}

describe('resolveCastImpact — category-aware dispel end-to-end', () => {
  it("default ('negative') strips the same fixed set as pre-§52 (regression net)", () => {
    expect(runDispelWith(undefined, ['slow', 'stun', 'burn', 'bless', 'heal'])).toEqual(['bless', 'heal']);
  });
  it("'positive' strips only buffs (anti-buff purge)", () => {
    expect(runDispelWith('positive', ['slow', 'bless', 'shield', 'evasion'])).toEqual(['slow']);
  });
  it("'poison' strips only poison + dot — leaves burn + stun in place", () => {
    expect(runDispelWith('poison', ['poison', 'dot', 'burn', 'stun'])).toEqual(['burn', 'stun']);
  });
  it("'stun' strips action-blockers, leaves slow + buffs untouched", () => {
    expect(runDispelWith('stun', ['stun', 'freeze', 'slow', 'bless'])).toEqual(['bless', 'slow']);
  });
  it("'shield' strips only the shield buff (precision purge)", () => {
    expect(runDispelWith('shield', ['shield', 'bless', 'heal'])).toEqual(['bless', 'heal']);
  });
  it("'bleed' (reserved, empty target set) leaves all effects in place — no accidental stripping", () => {
    expect(runDispelWith('bleed', ['slow', 'bless'])).toEqual(['bless', 'slow']);
  });
});
