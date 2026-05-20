import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Dark Avenger's `Sanguine Blade` (proficiency,
// L40) restores 5% of damage dealt as caster HP. Verified by
// landing a melee swing on a goblin and observing the caster's
// HP rise post-cast.

function makeAvenger(specializationId: string | null): PlayerState {
  return {
    id: 'avenger', socketId: 's', name: 'avenger',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'knight', unlockedSkills: ['slash'],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: PROFICIENCY_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function slashCast(caster: PlayerState, target: { id: string; position: { x: number; z: number } }): Cast {
  return {
    castId: 'c-slash', casterId: caster.id, skillId: 'slash',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

describe('Sanguine Blade lifesteal', () => {
  it('Dark Avenger restores 5% of damage dealt as HP', () => {
    const caster = makeAvenger('dark_avenger');
    const target = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, Date.now());
    const world: CombatWorld = {
      getEnemyById: (id) => (id === target.id ? target : null),
      getPlayerById: (id) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [target],
      onTargetDied: vi.fn(),
    };
    const out: OutboundEventSink = { publish: vi.fn() };

    const enemyHpBefore = target.health;
    const casterHpBefore = caster.health;
    resolveCastImpact(slashCast(caster, target), out, world);

    const damageDealt = enemyHpBefore - target.health;
    const hpRestored = caster.health - casterHpBefore;
    expect(damageDealt).toBeGreaterThan(0);
    expect(hpRestored).toBeCloseTo(damageDealt * 0.05, 4);
  });

  it('a knight without the spec gets no lifesteal', () => {
    const caster = makeAvenger(null);
    const target = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, Date.now());
    const world: CombatWorld = {
      getEnemyById: (id) => (id === target.id ? target : null),
      getPlayerById: (id) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [target],
      onTargetDied: vi.fn(),
    };
    const out: OutboundEventSink = { publish: vi.fn() };

    const before = caster.health;
    resolveCastImpact(slashCast(caster, target), out, world);
    expect(caster.health).toBe(before);
  });
});
