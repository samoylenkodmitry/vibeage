import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, Enemy } from '../packages/sim/entities';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { addStatus } from '../server/combat/skillMechanicPrimitives';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';

const NOW = 1_700_000_000_000;

describe('advanced skill mechanics batch 3', () => {
  it('resolves Ember Relay, Seismic Rend, and Harmonic Seal combo-control mechanics', () => {
    const caster = player('caster', 0, 0, ['ember_relay', 'seismic_rend', 'harmonic_seal']);
    const ally = player('ally', 1, 0);
    const emberTarget = enemy('ember-target', 6, 0);
    const emberNear = enemy('ember-near', 7, 1);
    const rendTarget = enemy('rend-target', 4, 0);
    addStatus({ target: emberTarget, type: 'burn', value: 4, durationMs: 4000, sourceSkill: 'test', now: NOW });
    addStatus({ target: rendTarget, type: 'dot', value: 4, durationMs: 4000, sourceSkill: 'test', now: NOW });
    const world = worldOf([caster, ally], [emberTarget, emberNear, rendTarget]);

    resolveCastImpact(targetedCast(caster.id, 'ember_relay', emberTarget.id, emberTarget.position), { publish: vi.fn() }, world, NOW);
    expect(emberTarget.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
    expect(emberNear.health).toBeLessThan(emberNear.maxHealth);
    expect(caster.statusEffects.some((effect) => effect.type === 'attackSpeed')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'seismic_rend', rendTarget.id, rendTarget.position), { publish: vi.fn() }, world, NOW + 100);
    expect(rendTarget.statusEffects.some((effect) => effect.type === 'stun')).toBe(true);
    expect(rendTarget.statusEffects.some((effect) => effect.type === 'dot')).toBe(true);

    const sealTarget = enemy('seal-target', 9, 0);
    const sealLinked = enemy('seal-linked', 10, 1);
    const sealWorld = worldOf([caster, ally], [sealTarget, sealLinked]);
    resolveCastImpact(targetedCast(caster.id, 'harmonic_seal', sealTarget.id, sealTarget.position), { publish: vi.fn() }, sealWorld, NOW + 200);
    expect(sealTarget.statusEffects.some((effect) => effect.type === 'silence')).toBe(true);
    expect(sealTarget.statusEffects.some((effect) => effect.type === 'soulLink')).toBe(true);
    expect(sealLinked.statusEffects.some((effect) => effect.type === 'soulLink')).toBe(true);
  });

  it('resolves Nightfall Net and Loaded Mirage trap-illusion mechanics', () => {
    const spawned: Enemy[] = [];
    const caster = player('caster', 0, 0, ['nightfall_net', 'loaded_mirage']);
    const netTarget = enemy('net-target', 8, 0);
    const netNear = enemy('net-near', 9, 1);
    const mirageTarget = enemy('mirage-target', 5, 0);
    const mirageNear = enemy('mirage-near', 6, 1);
    addStatus({ target: netTarget, type: 'marked', value: 1, durationMs: 4000, sourceSkill: 'test', now: NOW });
    addStatus({ target: mirageTarget, type: 'marked', value: 1, durationMs: 4000, sourceSkill: 'test', now: NOW });
    const world = worldOf([caster], [netTarget, netNear, mirageTarget, mirageNear], spawned);

    resolveCastImpact(targetedCast(caster.id, 'nightfall_net', netTarget.id, netTarget.position), { publish: vi.fn() }, world, NOW);
    expect(spawned).toHaveLength(1);
    expect(netTarget.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(netNear.statusEffects.some((effect) => effect.type === 'poison')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'loaded_mirage', mirageTarget.id, mirageTarget.position), { publish: vi.fn() }, world, NOW + 100);
    expect(spawned).toHaveLength(4);
    expect(caster.statusEffects.some((effect) => effect.type === 'reveal_loot')).toBe(true);
    expect(mirageTarget.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(mirageNear.targetId).toBe(caster.id);
  });

  it('resolves Pain Dividend and Cinder Halo defensive cashouts', () => {
    const caster = player('caster', 0, 0, ['pain_dividend', 'cinder_halo']);
    const ally = player('ally', 1, 0);
    const dividendTarget = enemy('dividend-target', 4, 0);
    const dividendNear = enemy('dividend-near', 5, 1);
    const haloEnemy = enemy('halo-enemy', 2, 1);
    ally.health = 700;
    addStatus({ target: dividendTarget, type: 'taunt', value: 1, durationMs: 4000, sourceSkill: 'test', now: NOW });
    addStatus({ target: caster, type: 'shield', value: 100, durationMs: 4000, sourceSkill: 'test', now: NOW });
    addStatus({ target: ally, type: 'poison', value: 4, durationMs: 4000, sourceSkill: 'test', now: NOW });
    const world = worldOf([caster, ally], [dividendTarget, dividendNear, haloEnemy]);

    resolveCastImpact(targetedCast(caster.id, 'pain_dividend', dividendTarget.id, dividendTarget.position), { publish: vi.fn() }, world, NOW);
    expect(caster.statusEffects.some((effect) => effect.type === 'damageReflect')).toBe(true);
    expect(dividendTarget.targetId).toBe(caster.id);
    expect(dividendNear.health).toBeLessThan(dividendNear.maxHealth);

    resolveCastImpact(selfCast(caster.id, 'cinder_halo'), { publish: vi.fn() }, world, NOW + 100);
    expect(ally.statusEffects.some((effect) => effect.type === 'poison')).toBe(false);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
    expect(haloEnemy.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
  });
});

function player(id: string, x: number, z: number, unlockedSkills: PlayerState['unlockedSkills'] = []): PlayerState {
  return {
    id, socketId: `${id}-socket`, name: id,
    position: { x, y: 0.5, z }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 500, maxMana: 500,
    className: 'mage', unlockedSkills, availableSkillPoints: 0, skillCooldownEndTs: {},
    statusEffects: [], level: 40, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2, accuracy: 999 },
  } as PlayerState;
}

function enemy(id: string, x: number, z: number): Enemy {
  const mob = createEnemy('goblin', 40, { x, y: 0.5, z }, NOW);
  mob.id = id;
  mob.health = 1000;
  mob.maxHealth = 1000;
  return mob;
}

function targetedCast(casterId: string, skillId: Cast['skillId'], targetId: string, pos: { x: number; z: number }): Cast {
  return {
    castId: `${skillId}-cast`,
    casterId,
    skillId,
    targetId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    target: { x: pos.x, z: pos.z },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function selfCast(casterId: string, skillId: Cast['skillId']): Cast {
  return {
    castId: `${skillId}-self-cast`,
    casterId,
    skillId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function worldOf(players: PlayerState[], enemies: Enemy[], spawned: Enemy[] = []): CombatWorld {
  return {
    getEnemyById: (id) => enemies.find((entity) => entity.id === id) ?? null,
    getPlayerById: (id) => players.find((entity) => entity.id === id) ?? null,
    getEntitiesInCircle: (pos, radius) => [...players, ...enemies, ...spawned].filter((entity) => {
      const dx = entity.position.x - pos.x;
      const dz = entity.position.z - pos.z;
      return dx * dx + dz * dz <= radius * radius;
    }),
    onTargetDied: vi.fn(),
    spawnMinion: (type, level, pos, now, options) => {
      spawned.push(createEnemy(type, level, pos, now, options));
    },
  };
}
