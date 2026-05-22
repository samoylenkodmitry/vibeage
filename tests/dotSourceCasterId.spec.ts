import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { Enemy, PlayerState } from '../packages/sim/entities';

/**
 * Archwork item #2 sub-work 2 — DoT ownership.
 *
 * StatusEffect now carries an optional `sourceCasterId` field set
 * to the id of the entity that applied the effect. The next piece
 * of the death-API rework (sub-work #1/#3) will read this when a
 * DoT tick lands the killing blow so XP / quest / loot credit
 * flows to the original caster.
 *
 * For now we just pin that the field is populated at apply time,
 * so by the time the death-API consumer ships it has a stable
 * field to rely on.
 */

function makeMage(): PlayerState {
  return {
    id: 'caster-mage',
    socketId: 'sock-1',
    name: 'CasterMage',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100,
    mana: 100, maxMana: 100,
    className: 'mage',
    unlockedSkills: ['fireball'],
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
    maxInventorySlots: 20,
  } as unknown as PlayerState;
}

function makeGoblin(): Enemy {
  return {
    id: 'goblin-1',
    type: 'goblin',
    name: 'Goblin',
    level: 2,
    position: { x: 5, y: 0.5, z: 0 },
    spawnPosition: { x: 5, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 80, maxHealth: 80,
    isAlive: true,
    attackDamage: 10, attackRange: 2,
    baseExperienceValue: 60, experienceValue: 60,
    statusEffects: [],
    targetId: null,
    aiState: 'idle',
    aggroRadius: 15,
    attackCooldownMs: 2000,
    lastAttackTime: 0,
    movementSpeed: 12,
    velocity: { x: 0, z: 0 },
  } as unknown as Enemy;
}

function fireballCast(caster: PlayerState, target: Enemy): Cast {
  return {
    castId: 'cast-fireball-1',
    casterId: caster.id,
    skillId: 'fireball',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(),
    castTimeMs: 300,
    targetId: target.id,
  };
}

function makeWorld(caster: PlayerState, target: Enemy): CombatWorld {
  return {
    getEnemyById: (id: string) => (id === target.id ? target : null),
    getPlayerById: (id: string) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  } as unknown as CombatWorld;
}

describe('upsertStatusEffect — sourceCasterId capture', () => {
  it('a DoT applied by a caster carries the caster id', () => {
    const caster = makeMage();
    const target = makeGoblin();
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballCast(caster, target), out, makeWorld(caster, target));

    // Fireball lands `damage` immediately + a `burn` DoT. The burn
    // should now carry the caster's id so a future DoT-tick kill
    // can credit it.
    const burn = target.statusEffects?.find((e) => e.type === 'burn');
    expect(burn).toBeDefined();
    expect(burn?.sourceCasterId).toBe(caster.id);
    // Existing field stays populated (no regression).
    expect(burn?.sourceSkill).toBe('fireball');
  });

  it('does not clobber sourceSkill when both fields populate', () => {
    const caster = makeMage();
    const target = makeGoblin();
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballCast(caster, target), out, makeWorld(caster, target));

    const burn = target.statusEffects?.find((e) => e.type === 'burn');
    expect(burn?.sourceSkill).toBe('fireball');
    expect(burn?.sourceCasterId).toBe(caster.id);
    // Other shape: still has id / value / startTimeTs / durationMs.
    expect(typeof burn?.id).toBe('string');
    expect(typeof burn?.startTimeTs).toBe('number');
    expect(burn?.durationMs).toBeGreaterThan(0);
  });
});
