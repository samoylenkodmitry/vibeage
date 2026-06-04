import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, Enemy } from '../packages/sim/entities';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { resolveCastImpact } from '../server/combat/impactResolver';
import {
  addStatus,
  applyReflectWard,
  applyStatusField,
  chainDamage,
  shieldAlliesInRadius,
  spawnIllusionsAround,
  tauntHostilesInRadius,
} from '../server/combat/skillMechanicPrimitives';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';

const NOW = 1_700_000_000_000;

describe('advanced skill mechanics batch 2', () => {
  it('shared primitives apply fields, chains, wards, shields, taunts, and illusions', () => {
    const spawned: Enemy[] = [];
    const caster = player('caster', 0, 0, ['stasis_lattice']);
    const ally = player('ally', 2, 0);
    const target = enemy('target', 4, 0);
    const chainTarget = enemy('chain-target', 5, 0);
    const tauntTarget = enemy('taunt-target', 3, 1);
    const world = worldOf([caster, ally], [target, chainTarget, tauntTarget], spawned);
    const cast = targetedCast(caster.id, 'stasis_lattice', target.id, target.position);

    const fieldTargets = applyStatusField({ caster, world, center: target.position, radius: 3, statuses: [{ type: 'root', value: 1, durationMs: 1000 }], cast, now: NOW });
    expect(fieldTargets.map((entity) => entity.id).sort()).toEqual(['chain-target', 'target', 'taunt-target']);
    expect(target.statusEffects.some((effect) => effect.type === 'root')).toBe(true);

    const chained = chainDamage({ caster, world, start: target, radius: 4, maxTargets: 2, rawDamage: 100, falloff: 0.5, cast, now: NOW });
    expect(chained).toHaveLength(2);
    expect(target.health).toBeLessThan(target.maxHealth);

    applyReflectWard({ target: caster, value: 25, durationMs: 2000, cast, now: NOW });
    shieldAlliesInRadius({ caster, world, center: caster.position, radius: 3, value: 80, durationMs: 2000, cast, now: NOW });
    tauntHostilesInRadius({ caster, world, center: caster.position, radius: 6, durationMs: 2000, cast, now: NOW });
    spawnIllusionsAround({ caster, world, now: NOW, center: target.position, count: 3, radius: 2, namePrefix: 'Test Phantom' });

    expect(caster.statusEffects.some((effect) => effect.type === 'damageReflect')).toBe(true);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
    expect(tauntTarget.targetId).toBe(caster.id);
    expect(tauntTarget.statusEffects.some((effect) => effect.type === 'taunt')).toBe(true);
    expect(spawned).toHaveLength(3);
  });

  it('Stasis Lattice, Blade Reversal, Sanctuary Gate, and Ricochet Prism resolve advanced mechanics', () => {
    const caster = player('caster', 0, 0, ['stasis_lattice', 'blade_reversal', 'sanctuary_gate', 'ricochet_prism']);
    const ally = player('ally', 3, 0);
    const stasisTarget = enemy('stasis-target', 8, 0);
    const stasisNearby = enemy('stasis-nearby', 10, 0);
    const bladeTarget = enemy('blade-target', 5, 0);
    const prismTarget = enemy('prism-target', 12, 0);
    const prismNearA = enemy('prism-near-a', 13, 1);
    const prismNearB = enemy('prism-near-b', 14, 0);
    ally.health = 420;
    addStatus({ target: stasisTarget, type: 'freeze', value: 1, durationMs: 5000, sourceSkill: 'test', now: NOW });
    addStatus({ target: bladeTarget, type: 'marked', value: 1, durationMs: 5000, sourceSkill: 'test', now: NOW });
    addStatus({ target: prismTarget, type: 'marked', value: 1, durationMs: 5000, sourceSkill: 'test', now: NOW });
    const world = worldOf([caster, ally], [stasisTarget, stasisNearby, bladeTarget, prismTarget, prismNearA, prismNearB]);

    resolveCastImpact(targetedCast(caster.id, 'stasis_lattice', stasisTarget.id, stasisTarget.position), { publish: vi.fn() }, world, NOW);
    expect(stasisTarget.statusEffects.some((effect) => effect.type === 'silence')).toBe(true);
    expect(stasisNearby.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'arcaneCharge')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'blade_reversal', bladeTarget.id, bladeTarget.position), { publish: vi.fn() }, world, NOW + 100);
    expect(caster.position.x).toBeGreaterThan(bladeTarget.position.x);
    expect(caster.statusEffects.some((effect) => effect.type === 'damageReflect')).toBe(true);
    expect(bladeTarget.health).toBeLessThan(bladeTarget.maxHealth - 190);

    caster.position = { x: 0, y: caster.position.y, z: 0 };
    resolveCastImpact(selfCast(caster.id, 'sanctuary_gate'), { publish: vi.fn() }, world, NOW + 200);
    expect(ally.health).toBeGreaterThan(420);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'ricochet_prism', prismTarget.id, prismTarget.position), { publish: vi.fn() }, world, NOW + 300);
    expect(prismTarget.health).toBeLessThan(prismTarget.maxHealth);
    expect(prismNearA.health).toBeLessThan(prismNearA.maxHealth);
    expect(prismNearB.statusEffects.some((effect) => effect.type === 'marked')).toBe(true);
  });

  it('Bulwark Zone, Purifying Mirror, and Phantom Split resolve advanced mechanics', () => {
    const spawned: Enemy[] = [];
    const caster = player('caster', 0, 0, ['bulwark_zone', 'purifying_mirror', 'phantom_split']);
    const ally = player('ally', 2, 0);
    const bulwarkEnemy = enemy('bulwark-enemy', 4, 0);
    const mirrorEnemy = enemy('mirror-enemy', 3, 2);
    const phantomTarget = enemy('phantom-target', 10, 0);
    const phantomNearby = enemy('phantom-nearby', 11, 1);
    ally.health = 500;
    addStatus({ target: bulwarkEnemy, type: 'taunt', value: 1, durationMs: 3000, sourceSkill: 'test', now: NOW });
    addStatus({ target: ally, type: 'poison', value: 4, durationMs: 3000, sourceSkill: 'test', now: NOW });
    addStatus({ target: caster, type: 'invisible', value: 1, durationMs: 3000, sourceSkill: 'test', now: NOW });
    const world = worldOf([caster, ally], [bulwarkEnemy, mirrorEnemy, phantomTarget, phantomNearby], spawned);

    resolveCastImpact(selfCast(caster.id, 'bulwark_zone'), { publish: vi.fn() }, world, NOW);
    expect(caster.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
    expect(bulwarkEnemy.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(bulwarkEnemy.targetId).toBe(caster.id);

    resolveCastImpact(selfCast(caster.id, 'purifying_mirror'), { publish: vi.fn() }, world, NOW + 100);
    expect(ally.statusEffects.some((effect) => effect.type === 'poison')).toBe(false);
    expect(ally.health).toBeGreaterThan(500);
    expect(caster.statusEffects.some((effect) => effect.type === 'damageReflect')).toBe(true);
    expect(mirrorEnemy.health).toBeLessThan(mirrorEnemy.maxHealth);

    resolveCastImpact(targetedCast(caster.id, 'phantom_split', phantomTarget.id, phantomTarget.position), { publish: vi.fn() }, world, NOW + 200);
    expect(spawned).toHaveLength(3);
    expect(caster.position.x).toBeGreaterThan(phantomTarget.position.x);
    expect(phantomTarget.statusEffects.some((effect) => effect.type === 'poison')).toBe(true);
    expect(phantomNearby.statusEffects.some((effect) => effect.type === 'marked')).toBe(true);
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
