import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { resolveCastImpact } from '../server/combat/impactResolver';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import { createTransientPlayer } from '../server/playerFactory';
import { recomputePlayerStats } from '../server/players/playerStatsRefresh';

const NOW = 1_700_000_000_000;

function makeWorld(caster: PlayerState): CombatWorld {
  return {
    getEnemyById: () => null,
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [],
    onTargetDied: vi.fn(),
  };
}

function selfCast(casterId: string, skillId: string): Cast {
  return {
    castId: `cast-${skillId}`,
    casterId,
    skillId: skillId as never,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
    // self-cast: no targetId, no targetPos
  };
}

describe('self-cast skills actually apply effects (user QoL #3)', () => {
  it('Holy Light heals the caster', () => {
    const caster = createTransientPlayer('s', 'p');
    caster.health = Math.floor(caster.maxHealth * 0.3); // hurt
    const healthBefore = caster.health;
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'holyLight'), outbound, makeWorld(caster));

    expect(caster.health).toBeGreaterThan(healthBefore);
  });

  it('Divine Shield applies a shield status effect to the caster', () => {
    const caster = createTransientPlayer('s', 'p');
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'divineShield'), outbound, makeWorld(caster));

    const shield = caster.statusEffects.find(e => e.type === 'shield');
    expect(shield, 'divineShield should add a shield status effect').toBeDefined();
    expect(shield?.value ?? 0).toBeGreaterThan(0);
  });

  it('Bless applies a damage/hit buff status effect to the caster', () => {
    const caster = createTransientPlayer('s', 'p');
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'bless'), outbound, makeWorld(caster));

    const bless = caster.statusEffects.find(e => e.type === 'bless');
    expect(bless, 'bless should add a bless status effect').toBeDefined();
  });

  it('Evade applies an evasion buff status effect', () => {
    const caster = createTransientPlayer('s', 'p');
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'evade'), outbound, makeWorld(caster));

    const evade = caster.statusEffects.find(e => e.type === 'evasion');
    expect(evade, 'evade should add an evasion status effect').toBeDefined();
  });

  it('Rapid Fire applies a bless buff status effect (damage tilt)', () => {
    const caster = createTransientPlayer('s', 'p');
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'rapidFire'), outbound, makeWorld(caster));

    const buff = caster.statusEffects.find(e => e.type === 'bless');
    expect(buff, 'rapidFire should add a bless status effect').toBeDefined();
  });

  it('Shield Wall applies a shield/damage-reduction effect', () => {
    const caster = createTransientPlayer('s', 'p');
    caster.className = 'warrior';
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'shieldWall'), outbound, makeWorld(caster));

    expect(caster.statusEffects.length, 'shieldWall should add at least one status effect').toBeGreaterThan(0);
  });

});

describe('bless effect is consumed by damage calculation (regression for the new wiring)', () => {
  it('bless effect actually multiplies outgoing damage (not just inserted)', () => {
    // Create two identical casts at the same skill against the same
    // target health pool — one caster has bless, the other doesn't.
    // The blessed caster should deal more damage.
    const makeCaster = (): PlayerState => {
      const p = createTransientPlayer('s', 'p');
      p.level = 5;
      // Pin critChance to 0 so the comparison isn't randomly tilted
      // by one caster critting and the other not — the test only
      // wants to prove bless contributes a multiplier, not assert
      // overall damage stability. Previously failed on CI when the
      // two casters' RNG seeds happened to land on opposite crit
      // sides of the threshold.
      if (p.stats) p.stats.critChance = 0;
      return p;
    };
    const unblessed = makeCaster();
    const blessed = makeCaster();
    blessed.statusEffects = [
      { id: 'b', type: 'bless', value: 50, durationMs: 5_000, startTimeTs: Date.now(), sourceSkill: 'bless' },
    ];
    // §45.3 — recompute stats so the bless contribution lands in
    // dmgMult. In production this happens inside upsertStatusEffect;
    // tests that hand-craft statusEffects must trigger it explicitly.
    recomputePlayerStats(blessed);

    // resolveCastImpact resolves against the world's caster lookup —
    // a fireball cast from each player on themselves would self-heal.
    // Instead, test the inner damage calc shape: bless caster.stats
    // dmgMult is effectively higher because of the new blessDamageMultiplier.
    // Sanity check via real cast resolution against an enemy stand-in.
    const targetPool: { id: string; health: number; maxHealth: number; isAlive: boolean; statusEffects: never[]; position: { x: number; y: number; z: number } }[] = [
      { id: 'enemy', health: 1000, maxHealth: 1000, isAlive: true, statusEffects: [], position: { x: 0, y: 0, z: 0 } },
    ];
    function makeWorld(caster: PlayerState): CombatWorld {
      return {
        getEnemyById: (id) => targetPool.find(e => e.id === id) as never,
        getPlayerById: (id) => (id === caster.id ? caster : null),
        getEntitiesInCircle: () => targetPool as never,
        onTargetDied: vi.fn(),
      };
    }
    function fireballCast(casterId: string): Cast {
      return {
        castId: `c-${casterId}`,
        casterId,
        skillId: 'fireball',
        state: CastState.Impact,
        origin: { x: 0, z: 0 },
        pos: { x: 0, z: 0 },
        startedAt: NOW,
        castTimeMs: 0,
        targetId: 'enemy',
      };
    }

    targetPool[0].health = 1000;
    resolveCastImpact(fireballCast(unblessed.id), { publish: vi.fn() }, makeWorld(unblessed));
    const unblessedDamage = 1000 - targetPool[0].health;

    targetPool[0].health = 1000;
    resolveCastImpact(fireballCast(blessed.id), { publish: vi.fn() }, makeWorld(blessed));
    const blessedDamage = 1000 - targetPool[0].health;

    expect(blessedDamage).toBeGreaterThan(unblessedDamage);
  });

  it('Dispel removes negative status effects from the caster', () => {
    const caster = createTransientPlayer('s', 'p');
    // Plant some negative effects on the caster.
    caster.statusEffects = [
      { id: 'b', type: 'burn', value: 5, durationMs: 5_000, startTimeTs: NOW, sourceSkill: 'fireball' },
      { id: 's', type: 'slow', value: 50, durationMs: 5_000, startTimeTs: NOW, sourceSkill: 'iceBolt' },
    ];
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id, 'dispel'), outbound, makeWorld(caster));

    // After dispel, neither burn nor slow should remain.
    expect(caster.statusEffects.find(e => e.type === 'burn')).toBeUndefined();
    expect(caster.statusEffects.find(e => e.type === 'slow')).toBeUndefined();
  });
});
