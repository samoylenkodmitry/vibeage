import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Phantom Ranger `Venom` (poisonTickMultiplier
// 1.3) and Plains Walker `Toxin` (poisonTickMultiplier 1.25) scale
// the stored `value` of every `poison` status effect they apply
// at upsert time. `dotTicker` reads the value verbatim, so the
// per-tick damage is already amplified.

function makeRogue(specializationId: string | null): PlayerState {
  return {
    id: 'rogue', socketId: 's', name: 'rogue',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'rogue', unlockedSkills: ['poisonBlade'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: SPECIALIZATION_UNLOCK_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function poisonBladeCast(caster: PlayerState, target: { id: string; position: { x: number; z: number } }): Cast {
  return {
    castId: 'c-pb', casterId: caster.id, skillId: 'poisonBlade',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

function poisonValueOn(entity: { statusEffects?: ReadonlyArray<{ type: string; value: number }> }): number {
  return entity.statusEffects?.find((e) => e.type === 'poison')?.value ?? 0;
}

describe('poison tick amplifier', () => {
  it('Plains Walker Toxin lands +25% per-tick poison damage', () => {
    const baseline = makeRogue(null);
    const plains = makeRogue('plains_walker');
    const targetA = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, Date.now());
    const targetB = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, Date.now() + 1);
    const worldA: CombatWorld = {
      getEnemyById: (id) => (id === targetA.id ? targetA : null),
      getPlayerById: (id) => (id === baseline.id ? baseline : null),
      getEntitiesInCircle: () => [targetA],
      onTargetDied: vi.fn(),
    };
    const worldB: CombatWorld = {
      getEnemyById: (id) => (id === targetB.id ? targetB : null),
      getPlayerById: (id) => (id === plains.id ? plains : null),
      getEntitiesInCircle: () => [targetB],
      onTargetDied: vi.fn(),
    };
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(poisonBladeCast(baseline, targetA), out, worldA);
    resolveCastImpact(poisonBladeCast(plains, targetB), out, worldB);

    const baseTick = poisonValueOn(targetA);
    const ampTick = poisonValueOn(targetB);
    expect(baseTick).toBeGreaterThan(0);
    expect(ampTick / baseTick).toBeCloseTo(1.25, 4);
  });
});
