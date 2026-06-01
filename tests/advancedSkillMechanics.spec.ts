import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, Enemy } from '../packages/sim/entities';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { isEntityStunned } from '../server/combat/statusQueries';
import { applyResolvedDamageToTarget } from '../server/combat/damageResolution';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';

const NOW = 1_700_000_000_000;

describe('advanced skill mechanics primitives', () => {
  it('Time Sphere stops every combatant in the target-anchored sphere except the caster', () => {
    const caster = player('caster', 0, 0, ['time_sphere']);
    const primary = enemy('primary', 10, 0);
    const nearbyMob = enemy('nearby', 13, 0);
    const nearbyPlayer = player('ally-in-sphere', 11, 1);
    const farMob = enemy('far', 20, 0);
    const world = worldOf([caster, nearbyPlayer], [primary, nearbyMob, farMob]);

    resolveCastImpact(
      targetedCast(caster.id, 'time_sphere', primary.id, primary.position),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(primary.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(nearbyMob.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(nearbyPlayer.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(false);
    expect(farMob.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(false);
    expect(isEntityStunned(primary, NOW)).toBe(true);
  });

  it('Spectral Guard applies a reflection buff that returns post-mitigation damage to the attacker', () => {
    const defender = player('defender', 0, 0, ['spectral_guard']);
    const attacker = enemy('attacker', 1, 0);
    attacker.health = 500;
    attacker.maxHealth = 500;
    const world = worldOf([defender], [attacker]);

    resolveCastImpact(
      selfCast(defender.id, 'spectral_guard'),
      { publish: vi.fn() },
      world,
      NOW,
    );

    const buff = defender.statusEffects.find((effect) => effect.type === 'damageReflect');
    expect(buff?.value).toBe(35);

    const taken = applyResolvedDamageToTarget(defender, 100, NOW + 100, { source: attacker });

    expect(taken).toBe(100);
    expect(defender.health).toBe(900);
    expect(attacker.health).toBe(465);
  });
});

function player(id: string, x: number, z: number, unlockedSkills: PlayerState['unlockedSkills'] = []): PlayerState {
  return {
    id,
    socketId: `${id}-socket`,
    name: id,
    position: { x, y: 0.5, z },
    rotation: { x: 0, y: 0, z: 0 },
    health: 1000,
    maxHealth: 1000,
    mana: 500,
    maxMana: 500,
    className: 'mage',
    unlockedSkills,
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

function worldOf(players: PlayerState[], enemies: Enemy[]): CombatWorld {
  return {
    getEnemyById: (id) => enemies.find((entity) => entity.id === id) ?? null,
    getPlayerById: (id) => players.find((entity) => entity.id === id) ?? null,
    getEntitiesInCircle: (pos, radius) => (
      [...players, ...enemies].filter((entity) => {
        const dx = entity.position.x - pos.x;
        const dz = entity.position.z - pos.z;
        return dx * dx + dz * dz <= radius * radius;
      })
    ),
    onTargetDied: vi.fn(),
  };
}
