import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { Enemy, PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function makeCaster(): PlayerState {
  return {
    id: 'p1',
    socketId: 'p1-s',
    name: 'Sneak',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    className: 'rogue',
    unlockedSkills: ['vanish'],

    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 7,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

function makeCast(casterId: string, targetedEnemyId: string | undefined): Cast {
  return {
    castId: 'c-vanish',
    casterId,
    skillId: 'vanish',
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
    targetId: targetedEnemyId,
  };
}

describe('PR KK — vanish self-target + aggro reset', () => {
  it('lands the invisible buff on the caster even when a mob is targeted', () => {
    const caster = makeCaster();
    const mob = createEnemy('goblin', 1, { x: 2, y: 0, z: 0 }, 1);
    const enemies = new Map<string, Enemy>([[mob.id, mob]]);
    const world: CombatWorld = {
      getEnemyById: (id) => enemies.get(id) ?? null,
      getPlayerById: (id) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [mob],
      onTargetDied: vi.fn(),
    };
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => { events.push(e); } };

    resolveCastImpact(makeCast(caster.id, mob.id), outbound, world, NOW);

    // Caster carries the invisible buff; mob does not.
    expect(caster.statusEffects.some((e) => e.type === 'invisible')).toBe(true);
    expect((mob.statusEffects ?? []).some((e) => e.type === 'invisible')).toBe(false);
  });

  it('clears every nearby mob that was chasing the caster', () => {
    const caster = makeCaster();
    const chaser = createEnemy('goblin', 1, { x: 3, y: 0, z: 0 }, 2);
    chaser.targetId = caster.id;
    chaser.aiState = 'chasing';
    const bystander = createEnemy('wolf', 1, { x: 5, y: 0, z: 0 }, 3);
    bystander.targetId = 'someoneElse';
    bystander.aiState = 'chasing';
    const enemies = new Map<string, Enemy>([[chaser.id, chaser], [bystander.id, bystander]]);
    const world: CombatWorld = {
      getEnemyById: (id) => enemies.get(id) ?? null,
      getPlayerById: (id) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [chaser, bystander],
      onTargetDied: vi.fn(),
    };
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => { events.push(e); } };

    resolveCastImpact(makeCast(caster.id, chaser.id), outbound, world, NOW);

    expect(chaser.targetId).toBeNull();
    expect(chaser.aiState).toBe('idle');
    // Bystander was chasing someone else — must stay untouched.
    expect(bystander.targetId).toBe('someoneElse');
    expect(bystander.aiState).toBe('chasing');
  });
});
