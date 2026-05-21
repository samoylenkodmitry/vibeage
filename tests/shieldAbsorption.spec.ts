import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function shield(id: string, value: number): StatusEffect {
  return {
    id,
    type: 'shield',
    value,
    durationMs: 10_000,
    startTimeTs: NOW,
    sourceSkill: 'divineShield',
  };
}

function makeCaster(id = 'attacker'): PlayerState {
  return {
    id,
    socketId: `${id}-s`,
    name: id,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'mage',
    unlockedSkills: ['fireball'],
    skillShortcuts: [],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

function makeWorld(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

function fireballCast(casterId: string, targetId: string): Cast {
  return {
    castId: 'c1',
    casterId,
    skillId: 'fireball',
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 5, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
    targetId,
  };
}

describe('shield absorption (Section 8 L500, L528)', () => {
  it('reduces incoming damage by the shield value before applying to health', () => {
    const caster = makeCaster();
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW /* spawnTimeTs */);
    target.health = 200;
    target.statusEffects = [shield('s1', 500)]; // huge buffer
    const healthBefore = target.health;
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballCast(caster.id, target.id), outbound, makeWorld(caster, target));

    // Shield was big enough to absorb everything → health untouched.
    expect(target.health).toBe(healthBefore);
    // Shield value decreased by the absorbed amount (some non-zero hit).
    expect(target.statusEffects[0].value).toBeLessThan(500);
  });

  it('depletes a smaller shield then spills overflow damage onto health', () => {
    const caster = makeCaster();
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW /* spawnTimeTs */);
    target.health = 1000; // big HP buffer so we measure delta only
    target.statusEffects = [shield('s1', 5)]; // tiny shield
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballCast(caster.id, target.id), outbound, makeWorld(caster, target));

    // Shield fully depleted → removed from list.
    expect(target.statusEffects.find(e => e.type === 'shield')).toBeUndefined();
    // Some damage landed on health.
    expect(target.health).toBeLessThan(1000);
  });

  it('absorbs across multiple shield stacks in array order', () => {
    const caster = makeCaster();
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW /* spawnTimeTs */);
    target.health = 1000;
    // Two small shields totalling 8 — fireball baseline damage will
    // chew through s1 first then dent s2.
    target.statusEffects = [shield('s1', 3), shield('s2', 5)];
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballCast(caster.id, target.id), outbound, makeWorld(caster, target));

    // s1 should be fully gone; s2 may still have value if total damage
    // was below 8, otherwise also gone with overflow on health.
    expect(target.statusEffects.find(e => e.id === 's1')).toBeUndefined();
    const s2 = target.statusEffects.find(e => e.id === 's2');
    if (s2) {
      expect(s2.value).toBeLessThan(5);
    } else {
      expect(target.health).toBeLessThan(1000);
    }
  });

  it('removes a shield once its value reaches 0 (no zero-value zombies in list)', () => {
    const caster = makeCaster();
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW /* spawnTimeTs */);
    target.health = 1000;
    target.statusEffects = [shield('s-exact', 1)]; // depletes immediately
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballCast(caster.id, target.id), outbound, makeWorld(caster, target));

    expect(target.statusEffects.filter(e => e.type === 'shield')).toEqual([]);
  });
});
