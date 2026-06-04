import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState, Enemy } from '../packages/sim/entities';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { isEntitySilenced, isEntityStunned } from '../server/combat/statusQueries';
import { applyResolvedDamageToTarget } from '../server/combat/damageResolution';
import { tickDamageOverTimeEffects } from '../server/combat/dotTicker';
import {
  addStatus,
  activeStatus,
  consumeStatus,
  damageHostilesInRadius,
  forceEnemyChase,
  healAlliesInRadius,
  healCombatant,
  moveCombatant,
  pullIntoRange,
  removeStatusTypes,
  suppressEnemyAggro,
  swapCombatants,
} from '../server/combat/skillMechanicPrimitives';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

const NOW = 1_700_000_000_000;

describe('advanced skill mechanics primitives', () => {
  registerPrimitiveContractTests();
  registerSwapTests();
  registerMobilityTests();
  registerTemporalTests();
  registerReflectionTests();
  registerRewindPortalTests();
  registerControlBatchTests();
  registerRedirectBatchTests();
  registerMovementBatchTests();
  registerMultiSpecBatchTests();
  registerDistributedSkillBatchTests();
  registerIdentitySkillBatchTests();
});

function registerPrimitiveContractTests() {
  it('shared mechanic primitives hard-relocate, pull, swap, heal, and retarget deterministically', () => {
    const caster = player('caster', 0, 0, []);
    const ally = player('ally', 8, 0, []);
    const target = enemy('target', 12, 0);
    caster.velocity = { x: 4, z: 0 };
    caster.movement = { isMoving: true, targetPos: { x: 10, z: 0 }, lastUpdateTime: NOW, speed: 6 };
    const moveEntity = vi.fn();
    const world = { ...worldOf([caster, ally], [target]), moveEntity };

    moveCombatant(caster, { x: 3, y: caster.position.y, z: 1 }, world);
    expect(caster.position).toMatchObject({ x: 3, z: 1 });
    expect(caster.velocity).toEqual({ x: 0, z: 0 });
    expect(caster.movement).toBeUndefined();
    expect(caster.dirtySnap).toBe(true);
    expect(moveEntity).toHaveBeenCalledWith(caster.id, { x: 0, z: 0 }, { x: 3, z: 1 });

    target.position = { x: 12, y: target.position.y, z: 1 };
    pullIntoRange(target, caster.position, 2, 6, world);
    expect(target.position.x).toBeCloseTo(6, 5);
    expect(target.position.z).toBeCloseTo(1, 5);
    expect(target.dirtySnap).toBe(true);

    swapCombatants(caster, ally, world);
    expect(caster.position.x).toBe(8);
    expect(ally.position.x).toBe(3);
    expect(caster.dirtySnap).toBe(true);
    expect(ally.dirtySnap).toBe(true);

    forceEnemyChase(target, caster, NOW + 1);
    expect(target.targetId).toBe(caster.id);
    expect(target.aiState).toBe('chasing');
    expect(target.chaseStartedAt).toBe(NOW + 1);

    suppressEnemyAggro(target, NOW + 2, 3000);
    expect(target.targetId).toBeNull();
    expect(target.aiState).toBe('idle');
    expect(target.aggroSuppressedUntilTs).toBe(NOW + 3002);

    ally.health = 500;
    expect(healCombatant(ally, 999)).toBe(500);
    expect(ally.health).toBe(ally.maxHealth);

    addStatus({ target: ally, type: 'shield', value: 10, durationMs: 1000, sourceSkill: 'test', now: NOW });
    addStatus({ target: ally, type: 'shield', value: 20, durationMs: 1000, sourceSkill: 'test', now: NOW + 1 });
    expect(ally.statusEffects.filter((effect) => effect.type === 'shield')).toHaveLength(1);
    expect(ally.statusEffects.find((effect) => effect.type === 'shield')?.value).toBe(20);
    expect(activeStatus(ally, 'shield', NOW + 2)?.value).toBe(20);
    expect(consumeStatus(ally, 'shield', NOW + 2)?.value).toBe(20);
    expect(activeStatus(ally, 'shield', NOW + 2)).toBeNull();

    addStatus({ target: ally, type: 'poison', value: 5, durationMs: 1000, sourceSkill: 'test', now: NOW });
    addStatus({ target: ally, type: 'slow', value: 30, durationMs: 1000, sourceSkill: 'test', now: NOW });
    ally.statusEffects.push({ id: 'expired-poison', type: 'poison', value: 1, durationMs: 1000, startTimeTs: NOW - 2000, sourceSkill: 'test' });
    expect(removeStatusTypes(ally, ['poison', 'slow'], NOW + 2)).toBe(2);
    expect(ally.statusEffects.some((effect) => effect.type === 'poison' || effect.type === 'slow')).toBe(false);

    target.health = target.maxHealth;
    damageHostilesInRadius({
      caster,
      world,
      center: { x: caster.position.x, z: caster.position.z },
      radius: 20,
      rawDamage: 50,
      cast: targetedCast(caster.id, 'basicAttack', target.id, target.position),
      now: NOW,
    });
    expect(target.health).toBeLessThan(target.maxHealth);

    ally.health = 500;
    healAlliesInRadius({ world, center: { x: caster.position.x, z: caster.position.z }, radius: 20, amount: 40 });
    expect(ally.health).toBe(540);
  });
}

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

function registerDistributedSkillBatchTests() {
  it('Phase Prison, Tripwire Volley, Guardian Hook, and Lifeline Swap resolve distributed spec mechanics', () => {
    const caster = player('caster', 0, 0, ['phase_prison', 'tripwire_volley', 'guardian_hook', 'lifeline_swap']);
    const ally = player('ally', 12, 0);
    const prisonTarget = enemy('prison-target', 9, 0);
    const prisonNearby = enemy('prison-nearby', 11, 0);
    const tripwireTarget = enemy('tripwire-target', 30, 0);
    const tripwireNearby = enemy('tripwire-nearby', 32, 0);
    const hookTarget = enemy('hook-target', 14, 0);
    const hookNearby = enemy('hook-nearby', 3, 0);
    ally.health = 300;
    const world = worldOf([caster, ally], [
      prisonTarget,
      prisonNearby,
      tripwireTarget,
      tripwireNearby,
      hookTarget,
      hookNearby,
    ]);

    resolveCastImpact(targetedCast(caster.id, 'phase_prison', prisonTarget.id, prisonTarget.position), { publish: vi.fn() }, world, NOW);
    expect(caster.statusEffects.some((effect) => effect.type === 'arcaneCharge')).toBe(true);
    expect(prisonTarget.position.x).toBeCloseTo(9, 5);
    expect(prisonNearby.position.x).toBeCloseTo(9.75, 5);
    expect(prisonNearby.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(prisonNearby.statusEffects.some((effect) => effect.type === 'silence')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'tripwire_volley', tripwireTarget.id, tripwireTarget.position), { publish: vi.fn() }, world, NOW + 100);
    expect(tripwireTarget.statusEffects.some((effect) => effect.type === 'marked')).toBe(true);
    expect(tripwireTarget.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(tripwireNearby.position.x).toBeGreaterThan(20);
    expect(tripwireNearby.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'guardian_hook', hookTarget.id, hookTarget.position), { publish: vi.fn() }, world, NOW + 200);
    expect(hookTarget.position.x).toBeCloseTo(4, 5);
    expect(caster.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
    expect(hookTarget.statusEffects.some((effect) => effect.type === 'taunt')).toBe(true);
    expect(hookNearby.statusEffects.some((effect) => effect.type === 'taunt')).toBe(true);
    expect(hookNearby.targetId).toBe(caster.id);
    expect(hookNearby.aiState).toBe('chasing');

    resolveCastImpact(targetedCast(caster.id, 'lifeline_swap', ally.id, ally.position), { publish: vi.fn() }, world, NOW + 300);
    expect(caster.position.x).toBe(12);
    expect(ally.position.x).toBe(0);
    expect(caster.dirtySnap).toBe(true);
    expect(ally.dirtySnap).toBe(true);
    expect(ally.health).toBe(510);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);
  });
}

function registerIdentitySkillBatchTests() {
  it('Combustion Bloom, Blood Magnet, Echoing Benediction, and Umbra Mine resolve identity mechanics', () => {
    const spawned: Enemy[] = [];
    const caster = player('caster', 0, 0, ['combustion_bloom', 'blood_magnet', 'echoing_benediction', 'umbra_mine']);
    const ally = player('ally', 2, 0);
    const burnTarget = enemy('burn-target', 8, 0);
    const burnNearby = enemy('burn-nearby', 10, 0);
    const magnetTarget = enemy('magnet-target', 6, 1);
    const mineTarget = enemy('mine-target', 14, 0);
    const mineNearby = enemy('mine-nearby', 16, 0);
    ally.health = 500;
    addStatus({ target: burnTarget, type: 'burn', value: 5, durationMs: 5000, sourceSkill: 'fireball', now: NOW });
    const world = worldOf([caster, ally], [burnTarget, burnNearby, magnetTarget, mineTarget, mineNearby], spawned);

    resolveCastImpact(targetedCast(caster.id, 'combustion_bloom', burnTarget.id, burnTarget.position), { publish: vi.fn() }, world, NOW);
    expect(caster.statusEffects.some((effect) => effect.type === 'bless')).toBe(true);
    expect(burnTarget.health).toBeLessThan(burnTarget.maxHealth);
    expect(burnNearby.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);

    resolveCastImpact(selfCast(caster.id, 'blood_magnet'), { publish: vi.fn() }, world, NOW + 100);
    expect(magnetTarget.position.x).toBeLessThan(6);
    expect(magnetTarget.statusEffects.some((effect) => effect.type === 'dot')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'attackSpeed')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);

    caster.health = 900;
    caster.statusEffects = caster.statusEffects.filter((effect) => effect.type !== 'bless');
    resolveCastImpact(selfCast(caster.id, 'echoing_benediction'), { publish: vi.fn() }, world, NOW + 200);
    expect(caster.statusEffects.some((effect) => effect.type === 'bless')).toBe(true);
    expect(ally.health).toBeGreaterThan(500);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'umbra_mine', mineTarget.id, mineTarget.position), { publish: vi.fn() }, world, NOW + 300);
    expect(spawned).toHaveLength(1);
    expect(mineTarget.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(mineNearby.statusEffects.some((effect) => effect.type === 'poison')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'invisible')).toBe(true);
  });

  it('Vengeance Tether, Sunbreak Charge, Tidal Barrier, Jackpot Snare, and Razorwind Step resolve identity mechanics', () => {
    const caster = player('caster', 0, 0, ['vengeance_tether', 'sunbreak_charge', 'tidal_barrier', 'jackpot_snare', 'razorwind_step']);
    const ally = player('ally', 10, 0);
    const tetherTarget = enemy('tether-target', 10, 0);
    const sunbreakTarget = enemy('sunbreak-target', 8, 0);
    const barrierEnemy = enemy('barrier-enemy', 3, 0);
    const snareTarget = enemy('snare-target', 14, 0);
    const snareNearby = enemy('snare-nearby', 16, 0);
    const razorTarget = enemy('razor-target', 18, 0);
    const razorNearby = enemy('razor-nearby', 20, 0);
    const razorFragile = enemy('razor-fragile', 21, 0);
    ally.health = 700;
    razorFragile.health = 1;
    addStatus({ target: ally, type: 'poison', value: 5, durationMs: 5000, sourceSkill: 'test', now: NOW });
    addStatus({ target: razorTarget, type: 'poison', value: 5, durationMs: 5000, sourceSkill: 'test', now: NOW });
    const world = worldOf([caster, ally], [
      tetherTarget,
      sunbreakTarget,
      barrierEnemy,
      snareTarget,
      snareNearby,
      razorTarget,
      razorNearby,
      razorFragile,
    ]);

    resolveCastImpact(targetedCast(caster.id, 'vengeance_tether', tetherTarget.id, tetherTarget.position), { publish: vi.fn() }, world, NOW);
    expect(tetherTarget.position.x).toBeCloseTo(3.2, 5);
    expect(tetherTarget.targetId).toBe(caster.id);
    expect(tetherTarget.statusEffects.some((effect) => effect.type === 'vengeanceTether')).toBe(true);
    expect(caster.statusEffects.some((effect) => effect.type === 'damageReflect')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'sunbreak_charge', sunbreakTarget.id, sunbreakTarget.position), { publish: vi.fn() }, world, NOW + 100);
    expect(caster.position.x).toBeGreaterThan(sunbreakTarget.position.x);
    expect(sunbreakTarget.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
    expect(ally.health).toBeGreaterThan(700);

    caster.position = { x: 0, y: caster.position.y, z: 0 };
    ally.position = { x: 2, y: ally.position.y, z: 0 };
    resolveCastImpact(selfCast(caster.id, 'tidal_barrier'), { publish: vi.fn() }, world, NOW + 200);
    expect(barrierEnemy.position.x).toBeGreaterThan(3);
    expect(barrierEnemy.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);
    expect(ally.statusEffects.some((effect) => effect.type === 'poison')).toBe(false);
    expect(ally.statusEffects.some((effect) => effect.type === 'shield')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'jackpot_snare', snareTarget.id, snareTarget.position), { publish: vi.fn() }, world, NOW + 300);
    expect(caster.statusEffects.some((effect) => effect.type === 'reveal_loot')).toBe(true);
    expect(snareTarget.statusEffects.some((effect) => effect.type === 'root')).toBe(true);
    expect(snareNearby.statusEffects.some((effect) => effect.type === 'marked')).toBe(true);

    resolveCastImpact(targetedCast(caster.id, 'razorwind_step', razorTarget.id, razorTarget.position), { publish: vi.fn() }, world, NOW + 400);
    expect(caster.position.x).toBeGreaterThan(razorTarget.position.x);
    expect(caster.statusEffects.some((effect) => effect.type === 'speed_boost')).toBe(true);
    expect(razorTarget.health).toBeLessThan(razorTarget.maxHealth);
    expect(razorNearby.statusEffects.some((effect) => effect.type === 'poison')).toBe(true);
    expect(razorFragile.statusEffects.some((effect) => effect.type === 'dot' || effect.type === 'poison')).toBe(false);
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
