import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, Enemy } from '../packages/sim/entities';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { isEntitySilenced, isEntityStunned } from '../server/combat/statusQueries';
import { applyResolvedDamageToTarget } from '../server/combat/damageResolution';
import { tickDamageOverTimeEffects } from '../server/combat/dotTicker';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

const NOW = 1_700_000_000_000;

describe('advanced skill mechanics primitives', () => {
  registerSwapTests();
  registerMobilityTests();
  registerTemporalTests();
  registerReflectionTests();
  registerRewindPortalTests();
  registerControlBatchTests();
  registerRedirectBatchTests();
  registerMovementBatchTests();
  registerMultiSpecBatchTests();
});

function registerSwapTests() {
  it('Dimensional Swap exchanges caster and target positions and snaps both combatants', () => {
    const caster = player('caster', 0, 0, ['dimensional_swap']);
    const target = enemy('target', 8, 0);
    const world = worldOf([caster], [target]);

    resolveCastImpact(
      targetedCast(caster.id, 'dimensional_swap', target.id, target.position),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(caster.position.x).toBe(8);
    expect(caster.position.z).toBe(0);
    expect(target.position.x).toBe(0);
    expect(target.position.z).toBe(0);
    expect(caster.velocity).toEqual({ x: 0, z: 0 });
    expect(target.velocity).toEqual({ x: 0, z: 0 });
    expect(caster.dirtySnap).toBe(true);
    expect(target.dirtySnap).toBe(true);
    expect(target.statusEffects.some((effect) => effect.type === 'stun')).toBe(true);
  });

  it('Dimensional Swap does not move the caster when the target is already dead', () => {
    const caster = player('caster', 0, 0, ['dimensional_swap']);
    const target = enemy('target', 8, 0);
    target.isAlive = false;
    target.health = 0;
    const world = worldOf([caster], [target]);

    resolveCastImpact(
      targetedCast(caster.id, 'dimensional_swap', target.id, target.position),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(caster.position.x).toBe(0);
    expect(target.position.x).toBe(8);
    expect(caster.dirtySnap).toBeUndefined();
    expect(target.dirtySnap).toBeUndefined();
  });

  it('Dimensional Swap still swaps when its damage kills a living target', () => {
    const caster = player('caster', 0, 0, ['dimensional_swap']);
    const target = enemy('target', 8, 0);
    target.health = 1;
    const world = worldOf([caster], [target]);

    resolveCastImpact(
      targetedCast(caster.id, 'dimensional_swap', target.id, target.position),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(caster.position.x).toBe(8);
    expect(target.position.x).toBe(0);
    expect(target.health).toBeLessThanOrEqual(0);
  });
}

function registerMobilityTests() {
  it('Rift Step damages enemies in the target rift and blinks the caster through the target', () => {
    const caster = player('caster', 0, 0, ['rift_step']);
    const primary = enemy('primary', 8, 0);
    const nearby = enemy('nearby', 10, 0);
    const far = enemy('far', 12, 0);
    const world = worldOf([caster], [primary, nearby, far]);

    resolveCastImpact(
      targetedCast(caster.id, 'rift_step', primary.id, primary.position),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(primary.health).toBeLessThan(primary.maxHealth);
    expect(nearby.health).toBeLessThan(nearby.maxHealth);
    expect(far.health).toBe(far.maxHealth);
    expect(primary.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);
    expect(nearby.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);
    expect(caster.position.x).toBeCloseTo(9.4, 5);
    expect(caster.position.z).toBeCloseTo(0, 5);
    expect(caster.dirtySnap).toBe(true);
  });

  it('Waygate hastes nearby allies and drops pursuit targeting them', () => {
    const caster = player('caster', 0, 0, ['waygate']);
    const ally = player('ally', 2, 0);
    const farAlly = player('far-ally', 20, 0);
    const chaser = enemy('chaser', 3, 0);
    chaser.targetId = ally.id;
    chaser.aiState = 'chasing';
    const world = worldOf([caster, ally, farAlly], [chaser]);

    resolveCastImpact(
      selfCast(caster.id, 'waygate'),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(caster.statusEffects.some((effect) => effect.type === 'speed_boost')).toBe(true);
    expect(ally.statusEffects.some((effect) => effect.type === 'speed_boost')).toBe(true);
    expect(farAlly.statusEffects.some((effect) => effect.type === 'speed_boost')).toBe(false);
    expect(chaser.targetId).toBeNull();
    expect(chaser.aiState).toBe('idle');
  });
}

function registerTemporalTests() {
  it('Time Sphere stops every combatant in the target-anchored sphere except the caster', () => {
    const caster = player('caster', 0, 0, ['time_sphere']);
    const primary = enemy('primary', 10, 0);
    const nearbyMob = enemy('nearby', 13, 0);
    const edgeMob = enemy('edge', 17.5, 0);
    const nearbyPlayer = player('ally-in-sphere', 11, 1);
    const farMob = enemy('far', 20, 0);
    const world = worldOf([caster, nearbyPlayer], [primary, nearbyMob, edgeMob, farMob]);

    resolveCastImpact(
      targetedCast(caster.id, 'time_sphere', primary.id, primary.position),
      { publish: vi.fn() },
      world,
      NOW,
    );

    expect(primary.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(nearbyMob.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(edgeMob.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(nearbyPlayer.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(false);
    expect(farMob.statusEffects.some((effect) => effect.type === 'timeStop')).toBe(false);
    expect(isEntityStunned(primary, NOW)).toBe(true);
  });
}

function registerReflectionTests() {
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
}

function registerRewindPortalTests() {
  it('Rewind Mark and Portal Pair relocate players with hard snaps', () => {
    const caster = player('caster', 10, 0, ['rewind_mark', 'portal_pair']);
    const ally = player('ally', 3, 0);
    caster.health = 400;
    caster.mana = 100;
    caster.posHistory = [{ ts: NOW - 5000, x: 1, z: 2 }];
    const world = worldOf([caster, ally], []);

    resolveCastImpact(selfCast(caster.id, 'rewind_mark'), { publish: vi.fn() }, world, NOW);
    expect(caster.position.x).toBe(1);
    expect(caster.position.z).toBe(2);
    expect(caster.health).toBe(610);
    expect(caster.dirtySnap).toBe(true);

    resolveCastImpact(groundCast(caster.id, 'portal_pair', { x: 30, z: 10 }), { publish: vi.fn() }, world, NOW + 1);
    expect(caster.position.x).toBe(30);
    expect(ally.position.x).toBe(32);
    expect(ally.dirtySnap).toBe(true);
  });
}

function registerControlBatchTests() {
  it('Gravity Well, Terrain Sigil, Puppet Mastery, and Silence Bubble control enemies differently', () => {
    const caster = player('caster', 0, 0, ['gravity_well', 'terrain_sigil', 'puppet_mastery', 'silence_bubble']);
    const primary = enemy('primary', 10, 0);
    const nearby = enemy('nearby', 15, 0);
    const silenced = enemy('silenced', 24, 0);
    primary.targetId = caster.id;
    primary.aiState = 'chasing';
    const world = worldOf([caster], [primary, nearby, silenced]);

    resolveCastImpact(targetedCast(caster.id, 'gravity_well', primary.id, primary.position), { publish: vi.fn() }, world, NOW);
    expect(nearby.position.x).toBeLessThan(15);
    expect(nearby.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'terrain_sigil', primary.id, primary.position), { publish: vi.fn() }, world, NOW + 10);
    expect(primary.statusEffects.some((effect) => effect.type === 'root')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'puppet_mastery', primary.id, primary.position), { publish: vi.fn() }, world, NOW + 20);
    expect(primary.targetId).toBeNull();
    expect(primary.aggroSuppressedUntilTs).toBe(NOW + 20 + 3500);

    resolveCastImpact(targetedCast(caster.id, 'silence_bubble', silenced.id, silenced.position), { publish: vi.fn() }, world, NOW + 30);
    expect(silenced.statusEffects.some((effect) => effect.type === 'silence')).toBe(true);
    expect(isEntitySilenced(silenced, NOW + 30)).toBe(true);
    expect(isEntityStunned(silenced, NOW + 30)).toBe(false);
  });
}

function registerRedirectBatchTests() {
  it('Soul Link, Mirror Spell, Reflection Contract, and Projectile Capture redirect damage', () => {
    const caster = player('caster', 0, 0, ['soul_link', 'mirror_spell', 'reflection_contract']);
    const linkedA = enemy('linked-a', 6, 0);
    const linkedB = enemy('linked-b', 8, 0);
    const attacker = enemy('attacker', 2, 0);
    const world = worldOf([caster], [linkedA, linkedB, attacker]);

    resolveCastImpact(targetedCast(caster.id, 'soul_link', linkedA.id, linkedA.position), { publish: vi.fn() }, world, NOW);
    applyResolvedDamageToTarget(linkedA, 100, NOW + 100, { source: caster, world });
    expect(linkedB.health).toBe(965);

    resolveCastImpact(selfCast(caster.id, 'mirror_spell'), { publish: vi.fn() }, world, NOW + 200);
    applyResolvedDamageToTarget(caster, 100, NOW + 300, { kind: 'magical', source: attacker, world });
    expect(attacker.health).toBe(930);

    resolveCastImpact(selfCast(caster.id, 'reflection_contract'), { publish: vi.fn() }, world, NOW + 400);
    applyResolvedDamageToTarget(caster, 100, NOW + 500, { source: attacker, world });
    expect(attacker.health).toBe(860);

    resolveCastImpact(selfCast(caster.id, 'projectile_capture'), { publish: vi.fn() }, world, NOW + 600);
    const defenderBefore = caster.health;
    const attackerBefore = attacker.health;
    resolveCastImpact(targetedCast(attacker.id, 'fireball', caster.id, caster.position), { publish: vi.fn() }, world, NOW + 700);
    expect(caster.health).toBe(defenderBefore);
    expect(attacker.health).toBeLessThan(attackerBefore);
    expect(caster.statusEffects.some((effect) => effect.type === 'projectileCapture')).toBe(false);
  });
}

function registerMovementBatchTests() {
  it('Phase Step, Momentum Strike, Clone Swap, Delayed Fate, and Cataclysm Rings resolve their movement/damage hooks', () => {
    const caster = player('caster', 0, 0, ['phase_step', 'momentum_strike', 'clone_swap', 'delayed_fate', 'cataclysm_rings']);
    const target = enemy('target', 8, 0);
    const ringCenterSafe = enemy('safe', 8, 0);
    const ringOuter = enemy('outer', 13, 0);
    const spawned: Enemy[] = [];
    const world = worldOf([caster], [target, ringCenterSafe, ringOuter], spawned);

    resolveCastImpact(targetedCast(caster.id, 'phase_step', target.id, target.position), { publish: vi.fn() }, world, NOW);
    expect(caster.position.x).toBeGreaterThan(8);
    expect(caster.statusEffects.some((effect) => effect.type === 'afterimage')).toBe(true);

    caster.velocity = { x: 8, z: 0 };
    resolveCastImpact(targetedCast(caster.id, 'momentum_strike', target.id, target.position), { publish: vi.fn() }, world, NOW + 100);
    expect(target.position.x).toBeLessThan(8);

    resolveCastImpact(targetedCast(caster.id, 'clone_swap', target.id, target.position), { publish: vi.fn() }, world, NOW + 200);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].name).toContain('Illusion');

    resolveCastImpact(targetedCast(caster.id, 'delayed_fate', target.id, target.position), { publish: vi.fn() }, world, NOW + 300);
    expect(target.statusEffects.some((effect) => effect.type === 'fateDebt')).toBe(true);
    tickFateDebt(target, caster, NOW + 2800);
    expect(target.health).toBeLessThan(target.maxHealth);

    resolveCastImpact(targetedCast(caster.id, 'cataclysm_rings', ringCenterSafe.id, ringCenterSafe.position), { publish: vi.fn() }, world, NOW + 400);
    expect(ringCenterSafe.health).toBe(ringCenterSafe.maxHealth);
    expect(ringOuter.health).toBeLessThan(ringOuter.maxHealth);
  });
}

function registerMultiSpecBatchTests() {
  it('Magma Chain, Duelist Lunge, Phoenix Leap, and Aegis Relay resolve distinct multi-spec mechanics', () => {
    const caster = player('caster', 0, 0, ['magma_chain', 'duelist_lunge', 'phoenix_leap', 'aegis_relay']);
    const ally = player('ally', 5, 0);
    const chainTarget = enemy('chain-target', 12, 0);
    const lungeTarget = enemy('lunge-target', 8, 0);
    const lungeSecondary = enemy('lunge-secondary', 10, 0);
    const leapTarget = enemy('leap-target', 16, 0);
    const leapNearby = enemy('leap-nearby', 18, 0);
    const leapFar = enemy('leap-far', 24, 0);
    caster.health = 600;
    ally.health = 400;
    const world = worldOf([caster, ally], [chainTarget, lungeTarget, lungeSecondary, leapTarget, leapNearby, leapFar]);

    resolveCastImpact(targetedCast(caster.id, 'magma_chain', chainTarget.id, chainTarget.position), { publish: vi.fn() }, world, NOW);
    expect(chainTarget.position.x).toBeCloseTo(3, 5);
    expect(chainTarget.dirtySnap).toBe(true);
    expect(chainTarget.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
    expect(chainTarget.aiState).toBe('chasing');
    expect(chainTarget.targetId).toBe(caster.id);

    resolveCastImpact(targetedCast(caster.id, 'duelist_lunge', lungeTarget.id, lungeTarget.position), { publish: vi.fn() }, world, NOW + 100);
    expect(caster.position.x).toBeGreaterThan(lungeTarget.position.x);
    expect(lungeTarget.statusEffects.some((effect) => effect.type === 'marked')).toBe(true);
    expect(lungeSecondary.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);
    expect(lungeSecondary.health).toBeLessThan(lungeSecondary.maxHealth);

    resolveCastImpact(targetedCast(caster.id, 'phoenix_leap', leapTarget.id, leapTarget.position), { publish: vi.fn() }, world, NOW + 200);
    expect(caster.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
    expect(leapTarget.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
    expect(leapNearby.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
    expect(leapFar.health).toBe(leapFar.maxHealth);

    ally.position = { x: caster.position.x - 5, y: ally.position.y, z: caster.position.z };
    ally.health = 400;
    resolveCastImpact(selfCast(caster.id, 'aegis_relay'), { publish: vi.fn() }, world, NOW + 300);
    expect(caster.health).toBe(690);
    expect(ally.health).toBe(490);
    expect(ally.position.x).toBeCloseTo(caster.position.x - 1.5, 5);
    expect(ally.dirtySnap).toBe(true);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
  });
}

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

function worldOf(players: PlayerState[], enemies: Enemy[], spawned: Enemy[] = []): CombatWorld {
  return {
    getEnemyById: (id) => enemies.find((entity) => entity.id === id) ?? null,
    getPlayerById: (id) => players.find((entity) => entity.id === id) ?? null,
    getEntitiesInCircle: (pos, radius) => (
      [...players, ...enemies, ...spawned].filter((entity) => {
        const dx = entity.position.x - pos.x;
        const dz = entity.position.z - pos.z;
        return dx * dx + dz * dz <= radius * radius;
      })
    ),
    onTargetDied: vi.fn(),
    spawnMinion: (type, level, pos, now, options) => {
      spawned.push(createEnemy(type, level, pos, now, options));
    },
  };
}

function groundCast(casterId: string, skillId: Cast['skillId'], pos: { x: number; z: number }): Cast {
  return {
    castId: `${skillId}-ground-cast`,
    casterId,
    skillId,
    targetPos: pos,
    target: pos,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function tickFateDebt(target: Enemy, caster: PlayerState, now: number): void {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  state.players[caster.id] = caster;
  state.enemies[target.id] = target;
  spatial.insert(target.id, target.position);
  tickDamageOverTimeEffects(state, spatial, { publish: vi.fn() }, now);
}
