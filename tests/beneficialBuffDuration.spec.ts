import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Theurge `Inspiration` carries
// `beneficialBuffDurationMultiplier: 1.25`. When the caster
// applies a beneficial status (here `bless`), its stored
// `durationMs` is scaled by 1.25 at upsert time.

function makeHealer(specializationId: string | null): PlayerState {
  return {
    id: 'healer', socketId: 's', name: 'healer',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'healer', unlockedSkills: ['bless'],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: SPECIALIZATION_UNLOCK_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function blessCast(caster: PlayerState): Cast {
  // No targetId — beneficial-only skills self-fall-back to the
  // caster via `isBeneficialOnly` in resolveCastTargets.
  return {
    castId: 'c-bless', casterId: caster.id, skillId: 'bless',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: caster.position.x, z: caster.position.z },
    startedAt: Date.now(), castTimeMs: 0,
  };
}

function worldFor(caster: PlayerState): CombatWorld {
  return {
    getEnemyById: () => null,
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [caster],
    onTargetDied: vi.fn(),
  };
}

function blessDuration(player: PlayerState): number {
  const bless = (player.statusEffects ?? []).find((e) => e.type === 'bless');
  return bless?.durationMs ?? 0;
}

describe('Theurge Inspiration — +25% beneficial buff duration', () => {
  it("scales bless's stored durationMs by 1.25 when cast by a Theurge", () => {
    const baseline = makeHealer(null);
    const theurge = makeHealer('theurge');
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(blessCast(baseline), out, worldFor(baseline));
    resolveCastImpact(blessCast(theurge), out, worldFor(theurge));

    const baseDur = blessDuration(baseline);
    const ampDur = blessDuration(theurge);
    expect(baseDur).toBeGreaterThan(0);
    expect(ampDur / baseDur).toBeCloseTo(1.25, 4);
  });
});
