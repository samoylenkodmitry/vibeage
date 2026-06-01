import { describe, expect, it, vi } from 'vitest';
import { SKILLS, type SkillEffectType, type SkillId } from '../packages/content/skills';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, StatusEffect } from '../packages/sim/entities';
import { resolveCastImpact } from '../server/combat/impactResolver';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameSimulator, createSimulatedEnemy, createSimulatedPlayer } from '../server/sim/gameSimulator';
import { createReactionComboPolicy } from '../server/sim/reactionComboPolicy';

const NOW = 1_700_000_000_000;

describe('expanded skill reaction combos', () => {
  it('attaches reactions centrally across base and specialization skills', () => {
    expect(SKILLS.powerStrike.reactions?.map((reaction) => reaction.id)).toEqual(['shatter_stun']);
    expect(SKILLS.arcane_blast.reactions?.map((reaction) => reaction.id)).toEqual(['arcane_shatter', 'charged_arcana']);
    expect(SKILLS.arcane_supremacy.reactions?.map((reaction) => reaction.id)).toEqual(['arcane_overflow']);
    expect(SKILLS.aimed_volley.reactions?.map((reaction) => reaction.id)).toEqual(['kill_zone']);
    expect(SKILLS.soul_eater.reactions?.map((reaction) => reaction.id)).toEqual(['dark_feast']);
  });

  it('powerStrike consumes stun into shatter damage and a slow', () => {
    const baseline = hitEnemy('powerStrike', []);
    const reacted = hitEnemy('powerStrike', [effect('stun')]);

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken * 1.4);
    expect(reacted.target.statusEffects.some((entry) => entry.type === 'stun')).toBe(false);
    expect(reacted.target.statusEffects.some((entry) => entry.type === 'slow')).toBe(true);
  });

  it('arcane blast shatters frozen targets', () => {
    const baseline = hitEnemy('arcane_blast', []);
    const reacted = hitEnemy('arcane_blast', [effect('freeze')]);

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken * 1.5);
    expect(reacted.target.statusEffects.some((entry) => entry.type === 'freeze')).toBe(false);
    expect(reacted.target.statusEffects.some((entry) => entry.type === 'slow')).toBe(true);
  });

  it('wounded-target reactions trigger from health thresholds', () => {
    const baseline = hitEnemy('killing_strike', [], { health: 100_000, maxHealth: 100_000 });
    const reacted = hitEnemy('killing_strike', [], { health: 30_000, maxHealth: 100_000 });

    expect(reacted.damageTaken).toBeGreaterThan(baseline.damageTaken * 1.6);
  });

  it('soul eater dark feast grants the caster a shield without target heal leakage', () => {
    const result = hitEnemy('soul_eater', [], { health: 30_000, maxHealth: 100_000 });

    expect(result.damageTaken).toBeGreaterThan(0);
    expect(result.caster.statusEffects.some((entry) => entry.type === 'shield')).toBe(true);
  });
});

describe('simulated reaction combo rotations', () => {
  it('drives a warrior bash into power strike shatter through the real simulator', () => {
    const sim = createGameSimulator({ startMs: NOW });
    const warrior = createSimulatedPlayer({
      id: 'combo-warrior',
      className: 'warrior',
      level: 20,
      position: { x: 0, z: 0 },
      unlockedSkills: ['basicAttack', 'slash', 'bash', 'powerStrike'],
    });
    const target = createSimulatedEnemy('goblin', 20, { id: 'shatter-target', position: { x: 3, z: 0 }, healthMultiplier: 4 });

    sim.addPlayer(warrior, {
      policy: createReactionComboPolicy({ primarySkillId: 'powerStrike', fallbackSkillIds: ['bash', 'slash'] }),
    });
    sim.addEnemy(target);

    const result = sim.runUntil((state) => {
      const casts = state.summary().castsBySkill;
      return (casts.bash ?? 0) > 0 && (casts.powerStrike ?? 0) > 0;
    }, { timeoutMs: 30_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.castsBySkill.bash).toBeGreaterThan(0);
    expect(result.summary.castsBySkill.powerStrike).toBeGreaterThan(0);
    expect(result.summary.damageDoneById[warrior.id]).toBeGreaterThan(0);
  });
});

describe('simulated reaction combo policy safeguards', () => {
  it('does not spend a setup skill while the payoff is still cooling down', () => {
    const sim = createGameSimulator({ startMs: NOW });
    const warrior = createSimulatedPlayer({
      id: 'cooldown-warrior',
      className: 'warrior',
      level: 20,
      position: { x: 0, z: 0 },
      unlockedSkills: ['slash', 'bash', 'powerStrike'],
    });
    warrior.skillCooldownEndTs.powerStrike = NOW + 10_000;
    const target = createSimulatedEnemy('goblin', 20, { id: 'cooldown-target', position: { x: 2, z: 0 }, healthMultiplier: 5 });

    sim.addPlayer(warrior, {
      policy: createReactionComboPolicy({ primarySkillId: 'powerStrike', fallbackSkillIds: ['slash'] }),
    });
    sim.addEnemy(target);

    const result = sim.runUntil((state) => {
      const casts = state.summary().castsBySkill;
      return ((casts.slash ?? 0) + (casts.bash ?? 0) + (casts.powerStrike ?? 0)) > 0;
    }, { timeoutMs: 5_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.castsBySkill.slash).toBeGreaterThan(0);
    expect(result.summary.castsBySkill.bash ?? 0).toBe(0);
    expect(result.summary.castsBySkill.powerStrike ?? 0).toBe(0);
  });

  it('casts the payoff when one reaction is already satisfied', () => {
    const sim = createGameSimulator({ startMs: NOW });
    const rogue = createSimulatedPlayer({
      id: 'stealthed-rogue',
      className: 'rogue',
      level: 20,
      position: { x: 0, z: 0 },
      unlockedSkills: ['poisonBlade', 'vanish', 'backstab'],
    });
    rogue.statusEffects = [effect('invisible')];
    const target = createSimulatedEnemy('goblin', 20, { id: 'stealth-target', position: { x: 2, z: 0 }, healthMultiplier: 8 });

    sim.addPlayer(rogue, {
      policy: createReactionComboPolicy({ primarySkillId: 'backstab', fallbackSkillIds: ['poisonBlade'] }),
    });
    sim.addEnemy(target);

    const result = sim.runUntil((state) => {
      const casts = state.summary().castsBySkill;
      return ((casts.backstab ?? 0) + (casts.poisonBlade ?? 0)) > 0;
    }, { timeoutMs: 10_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.castsBySkill.backstab).toBeGreaterThan(0);
    expect(result.summary.castsBySkill.poisonBlade ?? 0).toBe(0);
  });
});

describe('simulated reaction combo payoff setup', () => {
  it('drives a rogue vanish setup into backstab payoff', () => {
    const sim = createGameSimulator({ startMs: NOW });
    const rogue = createSimulatedPlayer({
      id: 'combo-rogue',
      className: 'rogue',
      level: 20,
      position: { x: 0, z: 0 },
      unlockedSkills: ['basicAttack', 'poisonBlade', 'vanish', 'backstab'],
    });
    const target = createSimulatedEnemy('goblin', 20, { id: 'rogue-target', position: { x: 2, z: 0 }, healthMultiplier: 8 });

    sim.addPlayer(rogue, {
      policy: createReactionComboPolicy({ primarySkillId: 'backstab', fallbackSkillIds: ['poisonBlade'] }),
    });
    sim.addEnemy(target);

    const result = sim.runUntil((state) => {
      const casts = state.summary().castsBySkill;
      return (casts.vanish ?? 0) > 0 && (casts.backstab ?? 0) > 0;
    }, { timeoutMs: 35_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.castsBySkill.vanish).toBeGreaterThan(0);
    expect(result.summary.castsBySkill.backstab).toBeGreaterThan(0);
  });
});

function hitEnemy(
  skillId: SkillId,
  targetEffects: StatusEffect[],
  targetHealth: { health: number; maxHealth: number } = { health: 10_000, maxHealth: 10_000 },
) {
  const caster = makeCaster(skillId);
  const target = createEnemy('goblin', 20, { x: 3, y: 0, z: 0 }, NOW);
  target.id = 'target';
  target.health = targetHealth.health;
  target.maxHealth = targetHealth.maxHealth;
  target.statusEffects = targetEffects;

  resolveCastImpact(castAt(skillId, caster.id, target.id), { publish: vi.fn() }, worldFor(caster, target), NOW);

  return { caster, target, damageTaken: targetHealth.health - target.health };
}

function makeCaster(skillId: SkillId): PlayerState {
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
    statusEffects: [],
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

function effect(type: SkillEffectType): StatusEffect {
  return {
    id: `${type}-effect`,
    type,
    value: 1,
    durationMs: 10_000,
    startTimeTs: NOW,
    sourceSkill: 'test',
  };
}

function castAt(skillId: SkillId, casterId: string, targetId: string): Cast {
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

function worldFor(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}
