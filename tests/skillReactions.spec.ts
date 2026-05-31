import { describe, expect, it, vi } from 'vitest';
import { SKILLS, type SkillEffectType, type SkillId } from '../packages/content/skills';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, StatusEffect } from '../packages/sim/entities';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { applyPreparedSkillReactions, prepareSkillReactions } from '../server/combat/skillReactions';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';

const NOW = 1_700_000_000_000;

describe('skill reactions', () => {
  it('fireball consumes existing burn stacks for extra burst and reapplies burn', () => {
    const baseline = hitEnemy('fireball', []);
    const reacted = hitEnemy('fireball', [effect('burn', { id: 'old-burn', value: 4, stacks: 2 })]);

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken * 1.5);
    expect(reacted.target.statusEffects.find((effect) => effect.id === 'old-burn')).toBeUndefined();
    expect(reacted.target.statusEffects.find((effect) => effect.type === 'burn')).toBeDefined();
  });

  it('iceBolt consumes water weakness into a flash freeze', () => {
    const { target } = hitEnemy('iceBolt', [effect('waterWeakness', { id: 'wet' })]);

    expect(target.statusEffects.find((effect) => effect.type === 'waterWeakness')).toBeUndefined();
    expect(target.statusEffects.find((effect) => effect.type === 'freeze')?.durationMs).toBe(1200);
  });

  it('bash consumes bleed stacks for a harder longer shield stun', () => {
    const baseline = hitEnemy('bash', []);
    const reacted = hitEnemy('bash', [effect('dot', { id: 'bleed', stacks: 2 })]);

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken);
    expect(reacted.target.statusEffects.find((effect) => effect.type === 'dot')).toBeUndefined();
    expect(reacted.target.statusEffects.find((effect) => effect.type === 'stun')?.durationMs).toBe(2500);
  });

  it('smite punishes taunted enemies without consuming taunt', () => {
    const baseline = hitEnemy('smite', []);
    const reacted = hitEnemy('smite', [effect('taunt', { id: 'taunt' })]);

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken);
    expect(reacted.target.statusEffects.find((effect) => effect.type === 'taunt')).toBeDefined();
  });

  it('arrowShot rewards kiting into slowed targets', () => {
    const baseline = hitEnemy('arrowShot', []);
    const reacted = hitEnemy('arrowShot', [effect('slow', { id: 'slow' })]);

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken);
    expect(reacted.target.statusEffects.find((effect) => effect.type === 'slow')).toBeDefined();
  });

  it('backstab consumes stealth and poison for opener burst', () => {
    const baseline = hitEnemy('backstab', []);
    const reacted = hitEnemy(
      'backstab',
      [effect('poison', { id: 'poison', value: 8, stacks: 2 })],
      [effect('invisible', { id: 'stealth', value: 1 })],
    );

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken * 2);
    expect(reacted.caster.statusEffects.find((effect) => effect.type === 'invisible')).toBeUndefined();
    expect(reacted.target.statusEffects.find((effect) => effect.type === 'poison')).toBeUndefined();
  });

  it('dispel heals for each negative status effect removed', () => {
    const caster = makeCaster('dispel', [
      effect('slow', { id: 'slow' }),
      effect('burn', { id: 'burn' }),
      effect('shield', { id: 'shield', value: 100 }),
    ]);
    caster.health = 100;
    caster.maxHealth = 500;
    const world = worldFor(caster, null);

    resolveCastImpact(castAt('dispel', caster.id, caster.id), { publish: vi.fn() }, world, NOW);

    expect(caster.health).toBe(220);
    expect(caster.statusEffects.find((effect) => effect.type === 'slow')).toBeUndefined();
    expect(caster.statusEffects.find((effect) => effect.type === 'burn')).toBeUndefined();
    expect(caster.statusEffects.find((effect) => effect.type === 'shield')).toBeDefined();
  });

  it('shows player-facing reaction descriptions', () => {
    expect(SKILLS.fireball.reactions?.map((reaction) => reaction.description)).toContain(
      'Consumes existing Burn for +35% damage per stack.',
    );
  });
});

describe('skill reaction runtime helpers', () => {
  it('does not grant per-stack reaction damage without a consumed effect', () => {
    const caster = makeCaster('fireball');
    const target = createEnemy('goblin', 20, { x: 3, y: 0, z: 0 }, NOW);
    target.statusEffects = [effect('slow')];

    const reactions = prepareSkillReactions({
      ...SKILLS.fireball,
      reactions: [{
        id: 'mark_only',
        description: 'No consumed stacks.',
        flavor: 'impact',
        condition: { targetHasEffect: 'slow' },
        damageMultiplierPerConsumedStack: 0.5,
      }],
    }, target, caster, NOW);

    expect(reactions).toHaveLength(1);
    expect(reactions[0]?.damageMultiplier).toBe(1);
  });

  it('does not report caster reaction heals as target heals', () => {
    const caster = makeCaster('fireball');
    caster.health = 50;
    const target = createEnemy('goblin', 20, { x: 3, y: 0, z: 0 }, NOW);

    const healApplied = applyPreparedSkillReactions({
      target,
      caster,
      reactions: [{
        reactionId: 'caster_heal',
        flavor: 'impact',
        damageMultiplier: 1,
        effects: [],
        casterEffects: [{ type: 'heal', value: 25 }],
      }],
      outbound: { publish: vi.fn() },
      applyEffects: (recipient, effects) => {
        let healed = 0;
        for (const reactionEffect of effects) {
          if (reactionEffect.type !== 'heal') continue;
          const before = recipient.health;
          recipient.health = Math.min(recipient.maxHealth, recipient.health + reactionEffect.value);
          healed += recipient.health - before;
        }
        return healed;
      },
    });

    expect(caster.health).toBe(75);
    expect(healApplied).toBe(0);
  });

  it('emits a ReactionTriggered VFX message with the flavor + target position', () => {
    const caster = makeCaster('fireball');
    const target = createEnemy('goblin', 20, { x: 7, y: 0, z: -2 }, NOW);
    target.id = 'target';
    const publish = vi.fn();

    applyPreparedSkillReactions({
      target,
      caster,
      reactions: [{
        reactionId: 'detonate_burn',
        flavor: 'fire',
        damageMultiplier: 1.7,
        effects: [],
        casterEffects: [],
      }],
      outbound: { publish },
      applyEffects: () => 0,
    });

    const reaction = publish.mock.calls
      .map((call) => call[0])
      .find((payload) => payload?.type === 'serverMessage' && payload.message?.type === 'ReactionTriggered')
      ?.message;
    expect(reaction).toMatchObject({
      type: 'ReactionTriggered',
      reactionId: 'detonate_burn',
      flavor: 'fire',
      targetId: 'target',
      position: { x: 7, z: -2 },
    });
  });
});

function hitEnemy(skillId: SkillId, targetEffects: StatusEffect[], casterEffects: StatusEffect[] = []) {
  const caster = makeCaster(skillId, casterEffects);
  const target = createEnemy('goblin', 20, { x: 3, y: 0, z: 0 }, NOW);
  target.id = 'target';
  target.health = 10_000;
  target.maxHealth = 10_000;
  target.statusEffects = targetEffects;

  resolveCastImpact(castAt(skillId, caster.id, target.id), { publish: vi.fn() }, worldFor(caster, target), NOW);

  return { caster, target, damageTaken: 10_000 - target.health };
}

function makeCaster(skillId: SkillId, statusEffects: StatusEffect[] = []): PlayerState {
  return {
    id: 'caster',
    socketId: 'socket',
    name: 'caster',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 1000,
    maxHealth: 1000,
    mana: 500,
    maxMana: 500,
    className: 'mage',
    unlockedSkills: [skillId],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects,
    level: 40,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2, accuracy: 999 },
  } as PlayerState;
}

function effect(type: SkillEffectType, overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: `${type}-effect`,
    type,
    value: 1,
    durationMs: 10_000,
    startTimeTs: NOW,
    sourceSkill: 'test',
    ...overrides,
  };
}

function castAt(skillId: SkillId, casterId: string, targetId?: string): Cast {
  return {
    castId: `${skillId}-cast`,
    casterId,
    skillId,
    targetId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function worldFor(caster: PlayerState, target: ReturnType<typeof createEnemy> | null): CombatWorld {
  return {
    getEnemyById: (id) => (target && id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => (target ? [target] : [caster]),
    onTargetDied: vi.fn(),
  };
}
