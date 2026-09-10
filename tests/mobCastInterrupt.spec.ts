import { describe, expect, it } from 'vitest';
import { CastState } from '../packages/protocol/common';
import { SKILLS } from '../packages/content/skills';
import { MOB_CAST_INTERRUPT } from '../packages/content/enemiesAi';
import { bossSignatureSkillId } from '../packages/content/bossSkills';
import { interruptControlledMobCasts, mobInterruptReason } from '../server/combat/mobCastInterrupt';
import type { Cast, ActiveCastStore } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { Enemy } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'e1',
    type: 'troll',
    name: 'Hill Troll',
    level: 10,
    health: 200,
    maxHealth: 200,
    position: { x: 0, y: 0, z: 0 },
    spawnPosition: { x: 0, y: 0, z: 0 },
    isAlive: true,
    aiState: 'attacking',
    targetId: 'p1',
    attackCooldownMs: 2_000,
    lastAttackTime: NOW - 2_000,
    lastUpdateTime: NOW,
    statusEffects: [],
    skillCooldownEndTs: {},
    ...overrides,
  } as Enemy;
}

function makeCast(skillId: string, overrides: Partial<Cast> = {}): Cast {
  return {
    castId: 'c1',
    casterId: 'e1',
    skillId: skillId as Cast['skillId'],
    state: CastState.Casting,
    origin: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 900,
    targetId: 'p1',
    ...overrides,
  };
}

function makeWorld(enemy: Enemy): CombatWorld {
  return {
    getEnemyById: (id) => (id === enemy.id ? enemy : null),
    getPlayerById: () => null,
    getEntitiesInCircle: () => [],
    onTargetDied: () => undefined,
  };
}

function makeSink(): { sink: OutboundEventSink; events: OutboundEvent[] } {
  const events: OutboundEvent[] = [];
  return { sink: { publish: (event: OutboundEvent) => events.push(event) }, events };
}

function stun(startTimeTs = NOW) {
  return { id: 's', type: 'stun', value: 1, durationMs: 2_000, startTimeTs, sourceSkill: 'shieldBash' };
}

describe('mobInterruptReason — same rulebook as the player side', () => {
  it('reports no reason for an untouched caster', () => {
    expect(mobInterruptReason(makeEnemy(), makeCast('mobCleave'), NOW)).toBeNull();
  });

  it('treats stun (and freeze/root, via the shared predicate) as an interrupt', () => {
    const enemy = makeEnemy({ statusEffects: [stun()] as Enemy['statusEffects'] });
    expect(mobInterruptReason(enemy, makeCast('mobCleave'), NOW)).toBe('stun');
  });

  it('treats a silence as an interrupt', () => {
    const silenced = makeEnemy({
      statusEffects: [{ ...stun(), type: 'silence' }] as Enemy['statusEffects'],
    });
    expect(mobInterruptReason(silenced, makeCast('mobCleave'), NOW)).toBe('silence');
  });

  it('treats a knockback landed after the wind-up began as an interrupt', () => {
    const shoved = makeEnemy({ lastDisplacedTs: NOW + 100 });
    expect(mobInterruptReason(shoved, makeCast('mobCleave'), NOW + 200)).toBe('knockback');
  });

  it('ignores a knockback that happened before the cast started', () => {
    const shoved = makeEnemy({ lastDisplacedTs: NOW - 5_000 });
    expect(mobInterruptReason(shoved, makeCast('mobCleave'), NOW)).toBeNull();
  });
});

describe('interruptControlledMobCasts', () => {
  it('cancels a stunned brute mid-cleave, announces it, and delays the ability', () => {
    const enemy = makeEnemy({ statusEffects: [stun()] as Enemy['statusEffects'] });
    const casts: ActiveCastStore = { c1: makeCast('mobCleave') };
    const { sink, events } = makeSink();

    interruptControlledMobCasts(casts, sink, makeWorld(enemy), NOW + 100);

    expect(casts.c1).toBeUndefined();
    const announced = events.find((e) => e.type === 'serverMessage' && e.message.type === 'CastInterrupted');
    expect(announced).toBeDefined();
    // The ability is delayed rather than denied outright or refunded.
    const expected = Math.round((SKILLS.mobCleave.cooldownMs ?? 0) * MOB_CAST_INTERRUPT.cooldownFraction);
    expect(enemy.skillCooldownEndTs?.mobCleave).toBe(NOW + 100 + expected);
    // And the mob is staggered before it may swing at all.
    expect(enemy.lastAttackTime).toBe(NOW + 100 - enemy.attackCooldownMs + MOB_CAST_INTERRUPT.staggerMs);
  });

  it('leaves an uninterruptible boss signature running', () => {
    const skillId = bossSignatureSkillId('auriel');
    expect(SKILLS[skillId].isInterruptable).toBe(false);
    // The opt-out is visible to the player in the ability text too.
    expect(SKILLS[skillId].description).toContain('Unstoppable');

    const boss = makeEnemy({ isMiniBoss: true, statusEffects: [stun()] as Enemy['statusEffects'] });
    const casts: ActiveCastStore = { c1: makeCast(skillId) };
    const { sink, events } = makeSink();

    interruptControlledMobCasts(casts, sink, makeWorld(boss), NOW + 100);

    expect(casts.c1).toBeDefined();
    expect(events).toHaveLength(0);
  });

  it('ignores player casts — castInterrupt.ts owns those', () => {
    const casts: ActiveCastStore = { c1: makeCast('fireball', { casterId: 'p1' }) };
    const { sink, events } = makeSink();
    const world: CombatWorld = {
      getEnemyById: () => null,
      getPlayerById: () => null,
      getEntitiesInCircle: () => [],
      onTargetDied: () => undefined,
    };

    interruptControlledMobCasts(casts, sink, world, NOW + 100);

    expect(casts.c1).toBeDefined();
    expect(events).toHaveLength(0);
  });
});
