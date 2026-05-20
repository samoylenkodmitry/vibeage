import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';
import { recomputePlayerStats } from '../server/players/playerStatsRefresh';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Cardinal's `Greater Calling` spec passive
// carries `healOutputMultiplier: 1.25`, which feeds the new
// `healMult` stat. `applyHealEffect` multiplies the skill's heal
// value by the caster's `healMult` so the +25% disclaimer is now
// actually delivered.

function makeHealer(specializationId: string | null): PlayerState {
  const player: PlayerState = {
    id: 'healer-1', socketId: 's', name: 'healer',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 50, maxHealth: 1, mana: 100, maxMana: 1,
    className: 'healer', unlockedSkills: ['holyLight'],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: SPECIALIZATION_UNLOCK_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
  };
  recomputePlayerStats(player);
  return player;
}

function holyLightCast(caster: PlayerState, target: PlayerState): Cast {
  return {
    castId: 'c-heal', casterId: caster.id, skillId: 'holyLight',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

describe('heal-output multiplier from spec passive', () => {
  it('Cardinal at L20 lands +25% more heal than an unspecced healer', () => {
    const baseline = makeHealer(null);
    const cardinal = makeHealer('cardinal');

    expect(cardinal.stats?.healMult).toBeCloseTo(1.25, 4);
    expect(baseline.stats?.healMult).toBeCloseTo(1, 4);

    // Generous max so the +25% landing isn't clipped by the heal cap.
    const woundedA: PlayerState = { ...baseline, id: 'wounded-a', health: 50, maxHealth: 5000 };
    const woundedB: PlayerState = { ...baseline, id: 'wounded-b', health: 50, maxHealth: 5000 };

    const world = (caster: PlayerState, target: PlayerState): CombatWorld => ({
      getEnemyById: () => null,
      getPlayerById: (id: string) => (id === caster.id ? caster : id === target.id ? target : null),
      getEntitiesInCircle: () => [target],
      onTargetDied: vi.fn(),
    });
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(holyLightCast(baseline, woundedA), outbound, world(baseline, woundedA));
    resolveCastImpact(holyLightCast(cardinal, woundedB), outbound, world(cardinal, woundedB));

    const baseHeal = woundedA.health - 50;
    const ampHeal = woundedB.health - 50;
    expect(baseHeal).toBeGreaterThan(0);
    expect(ampHeal / baseHeal).toBeCloseTo(1.25, 4);
  });

  it("Eva's Templar at L20 carries healOutputMultiplier 1.2 in stats.healMult", () => {
    const evas = makeHealer('evas_templar');
    expect(evas.stats?.healMult).toBeCloseTo(1.2, 4);
  });
});
