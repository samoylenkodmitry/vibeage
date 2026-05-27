import { describe, expect, it, vi } from 'vitest';
import { isEntityTaunted, resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function makeCaster(id: string): PlayerState {
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
    className: 'warrior',
    unlockedSkills: ['taunt'],

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
  };
}

function makeWorld(opts: { caster: PlayerState; targetEnemy: ReturnType<typeof createEnemy> }) {
  const enemies = new Map<string, ReturnType<typeof createEnemy>>();
  enemies.set(opts.targetEnemy.id, opts.targetEnemy);
  return {
    getEnemyById: (id: string) => enemies.get(id) ?? null,
    getPlayerById: (id: string) => (id === opts.caster.id ? opts.caster : null),
    getEntitiesInCircle: () => [],
    onTargetDied: vi.fn(),
  } satisfies CombatWorld;
}

function makeCast(casterId: string, targetId: string): Cast {
  return {
    castId: 'c1',
    casterId,
    skillId: 'taunt',
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
    targetId,
  };
}

describe('enemy taunt', () => {
  it('forces a taunted enemy to target the taunter and switches to chasing', () => {
    const caster = makeCaster('taunter');
    const enemy = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, 1);
    enemy.targetId = 'someoneElse';
    enemy.aiState = 'idle';
    const world = makeWorld({ caster, targetEnemy: enemy });
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => { events.push(e); } };

    resolveCastImpact(makeCast(caster.id, enemy.id), outbound, world, NOW);

    expect(enemy.targetId).toBe(caster.id);
    expect(enemy.aiState).toBe('chasing');
    expect(isEntityTaunted(enemy, NOW)).toBe(true);
  });

  it('blocks damage-based retarget on a taunted enemy (taunt holds through subsequent hits)', () => {
    const taunter = makeCaster('taunter');
    const enemy = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, 2);
    const world = makeWorld({ caster: taunter, targetEnemy: enemy });
    const outbound: OutboundEventSink = { publish: vi.fn() };

    // Step 1: taunter taunts → enemy targets taunter
    resolveCastImpact(makeCast(taunter.id, enemy.id), outbound, world, NOW);
    expect(enemy.targetId).toBe(taunter.id);

    // Step 2: another caster hits the same enemy with a damaging skill.
    // Without the taunt guard, this would steal aggro.
    const otherCaster = makeCaster('other');
    const damagingCast: Cast = {
      castId: 'c2',
      casterId: otherCaster.id,
      skillId: 'fireball',
      state: CastState.Impact,
      origin: { x: 0, z: 0 },
      pos: { x: 5, z: 0 },
      startedAt: NOW + 100,
      castTimeMs: 0,
      targetId: enemy.id,
    };
    const otherWorld = {
      getEnemyById: (id: string) => (id === enemy.id ? enemy : null),
      getPlayerById: (id: string) => (id === otherCaster.id ? otherCaster : null),
      getEntitiesInCircle: () => [],
      onTargetDied: vi.fn(),
    } satisfies CombatWorld;

    resolveCastImpact(damagingCast, outbound, otherWorld, NOW);

    expect(enemy.targetId).toBe(taunter.id);
  });
});

describe('isEntityTaunted helper', () => {
  it('returns false when no taunt effect is present', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    expect(isEntityTaunted(enemy, NOW)).toBe(false);
  });

  it('returns true for an active taunt effect', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 4);
    enemy.statusEffects = [
      { id: 't', type: 'taunt', value: 1, durationMs: 5_000, startTimeTs: NOW, sourceSkill: 'taunt' },
    ];
    expect(isEntityTaunted(enemy, NOW)).toBe(true);
  });

  it('returns false when statusEffects is missing entirely', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 6);
    (enemy as Partial<typeof enemy>).statusEffects = undefined;
    expect(isEntityTaunted(enemy as typeof enemy, NOW)).toBe(false);
  });

  it('returns false for an expired taunt effect', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 5);
    enemy.statusEffects = [
      { id: 't', type: 'taunt', value: 1, durationMs: 1_000, startTimeTs: NOW - 5_000, sourceSkill: 'taunt' },
    ];
    expect(isEntityTaunted(enemy, NOW)).toBe(false);
  });
});
