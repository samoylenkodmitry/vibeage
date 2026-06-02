import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import type { Enemy, PlayerState } from '../packages/sim/entities';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { createCombatWorld } from '../server/combat/combatWorld';
import { tickCasts, type Cast } from '../server/combat/skillSystem';
import type { AreaPhysicsField } from '../server/physics/areaPhysics';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState, type GameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { advanceAll } from '../server/movement/worldMovement';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import { createWorldTickRunner } from '../server/world/tickPipeline';

const NOW = 1_700_000_000_000;

describe('time-stop area field movement', () => {
  it('Time Sphere creates a target-anchored physics field that excludes the caster', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const caster = player('caster', 0, 0);
    const target = enemy('target', 10, 0);
    state.players[caster.id] = caster;
    state.enemies[target.id] = target;
    insert(spatial, caster);
    insert(spatial, target);

    resolveCastImpact(
      timeSphereImpact(caster.id, target.id, target.position),
      outbound,
      createWorldCombatBridge(state, outbound, spatial),
      NOW,
    );

    const field = Object.values(state.activePhysicsFields)[0];
    expect(field).toMatchObject({
      kind: 'timeStop',
      sourceSkill: 'time_sphere',
      casterId: caster.id,
      origin: { x: 10, z: 0 },
      radius: 8,
      startTimeTs: NOW,
      durationMs: 3500,
    });
    expect(field?.excludedEntityIds).toContain(caster.id);
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'serverMessage',
      message: {
        type: 'PhysicsFieldSnapshot',
        field: expect.objectContaining({
          id: field?.id,
          kind: 'timeStop',
          sourceSkill: 'time_sphere',
          casterId: caster.id,
          origin: { x: 10, z: 0 },
          radius: 8,
        }),
      },
    });
    const physicsEvent = outbound.publish.mock.calls.find(([event]) => event.message?.type === 'PhysicsFieldSnapshot')?.[0];
    expect(physicsEvent?.message.field).not.toHaveProperty('excludedEntityIds');
  });

  it('freezes player and enemy movement inside the field, then lets player motion resume after expiry', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const runner = player('runner', 10, 0);
    runner.movement = { isMoving: true, targetPos: { x: 20, z: 0 }, lastUpdateTime: NOW, speed: 10 };
    runner.velocity = { x: 10, z: 0 };
    const mob = enemy('mob', 11, 0);
    mob.velocity = { x: 5, z: 0 };
    state.players[runner.id] = runner;
    state.enemies[mob.id] = mob;
    addTimeField(state, { origin: { x: 10, z: 0 }, radius: 5 });
    insert(spatial, runner);
    insert(spatial, mob);

    advanceAll(state, spatial, 1000, NOW + 1000);

    expect(runner.position.x).toBe(10);
    expect(runner.velocity).toEqual({ x: 0, z: 0 });
    expect(runner.movement?.targetPos).toEqual({ x: 20, z: 0 });
    expect(mob.position.x).toBe(11);
    expect(mob.velocity).toEqual({ x: 0, z: 0 });

    advanceAll(state, spatial, 1000, NOW + 3600);

    expect(state.activePhysicsFields.field).toBeUndefined();
    expect(runner.position.x).toBe(20);
    expect(runner.movement?.isMoving).toBe(false);
  });
});

describe('time-stop area active systems', () => {
  it('pauses casting progress while the caster is frozen inside the field', () => {
    const state = createGameState();
    const caster = player('caster', 0, 0);
    const target = enemy('target', 20, 0);
    state.players[caster.id] = caster;
    state.enemies[target.id] = target;
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });
    const cast = fireballCast(caster.id, target.id, CastState.Casting);
    state.activeCasts[cast.castId] = cast;
    const world = createCombatWorld(state, vi.fn());
    const outbound = { publish: vi.fn() };

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 1000);
    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 2000);
    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 3000);

    expect(cast.state).toBe(CastState.Casting);
    expect(cast.startedAt).toBe(NOW + 3000);

    tickCasts(state.activeCasts, 500, outbound, world, NOW + 3500);
    expect(cast.state).toBe(CastState.Casting);

    tickCasts(state.activeCasts, 500, outbound, world, NOW + 4000);
    expect(cast.state).toBe(CastState.Traveling);
  });
});

describe('time-stop area projectile physics', () => {
  it('pauses projectile travel while the projectile is inside the field', () => {
    const state = createGameState();
    const caster = player('caster', -10, 0);
    state.players[caster.id] = caster;
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });
    const cast = fireballCast(caster.id, undefined, CastState.Traveling);
    cast.pos = { x: 0, z: 0 };
    cast.dir = { x: 1, z: 0 };
    cast.speed = 10;
    state.activeCasts[cast.castId] = cast;
    const world = createCombatWorld(state, vi.fn());
    const outbound = { publish: vi.fn() };

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 1000);

    expect(cast.pos).toEqual({ x: 0, z: 0 });
    expect(cast.state).toBe(CastState.Traveling);

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 3600);

    expect(cast.pos?.x).toBeCloseTo(10, 5);
    expect(cast.state).toBe(CastState.Traveling);
  });

  it('freezes the field caster projectile after it separates from the caster', () => {
    const state = createGameState();
    const caster = player('caster', 0, 0);
    state.players[caster.id] = caster;
    addTimeField(state, {
      casterId: caster.id,
      excludedEntityIds: [caster.id],
      origin: { x: 0, z: 0 },
      radius: 5,
    });
    const cast = fireballCast(caster.id, undefined, CastState.Casting);
    cast.dir = { x: 1, z: 0 };
    cast.speed = 10;
    state.activeCasts[cast.castId] = cast;
    const world = createCombatWorld(state, vi.fn());
    const outbound = { publish: vi.fn() };

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 1000);
    expect(cast.state).toBe(CastState.Traveling);

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 2000);

    expect(cast.pos).toEqual({ x: 0, z: 0 });
    expect(cast.state).toBe(CastState.Traveling);
  });

  it('stops a projectile at the field boundary when it crosses stopped time in one tick', () => {
    const state = createGameState();
    const caster = player('caster', -10, 0);
    state.players[caster.id] = caster;
    addTimeField(state, {
      casterId: caster.id,
      excludedEntityIds: [caster.id],
      origin: { x: 0, z: 0 },
      radius: 5,
    });
    const cast = fireballCast(caster.id, undefined, CastState.Traveling);
    cast.origin = { x: -10, z: 0 };
    cast.pos = { x: -10, z: 0 };
    cast.dir = { x: 1, z: 0 };
    cast.speed = 20;
    state.activeCasts[cast.castId] = cast;
    const world = createCombatWorld(state, vi.fn());
    const outbound = { publish: vi.fn() };

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 1000);

    expect(cast.pos?.x).toBeCloseTo(-5, 5);
    expect(cast.pos?.z).toBeCloseTo(0, 5);
    expect(cast.state).toBe(CastState.Traveling);

    tickCasts(state.activeCasts, 1000, outbound, world, NOW + 2000);
    expect(cast.pos?.x).toBeCloseTo(-5, 5);
  });
});

describe('time-stop area AI suppression', () => {
  it('suppresses enemy AI while the enemy is frozen inside the field', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const target = player('target', 0, 0);
    const mob = enemy('mob', 3, 0);
    mob.velocity = { x: 5, z: 0 };
    state.players[target.id] = target;
    state.enemies[mob.id] = mob;
    addTimeField(state, { origin: { x: 3, z: 0 }, radius: 5 });
    insert(spatial, target);
    insert(spatial, mob);

    createWorldTickRunner({ state, spatial, outbound, tickMs: 1000, snapHz: 1 }).tick(NOW + 1000);

    expect(mob.position.x).toBe(3);
    expect(mob.velocity).toEqual({ x: 0, z: 0 });
    expect(mob.targetId).toBeFalsy();
    expect(mob.aiState).toBe('idle');
  });
});

function player(id: string, x: number, z: number): PlayerState {
  const p = createTransientPlayer(`${id}-socket`, id);
  p.id = id;
  p.position = { x, y: 0.5, z };
  p.level = 40;
  p.unlockedSkills = ['fireball', 'time_sphere'];
  p.statusEffects = [];
  p.velocity = { x: 0, z: 0 };
  return p;
}

function enemy(id: string, x: number, z: number): Enemy {
  const mob = createEnemy('goblin', 40, { x, y: 0.5, z }, NOW);
  mob.id = id;
  mob.health = 1000;
  mob.maxHealth = 1000;
  mob.aiState = 'idle';
  mob.targetId = null;
  return mob;
}

function insert(spatial: SpatialHashGrid, entity: PlayerState | Enemy): void {
  spatial.insert(entity.id, { x: entity.position.x, z: entity.position.z });
}

function addTimeField(state: GameState, overrides: Partial<AreaPhysicsField> = {}): AreaPhysicsField {
  const field: AreaPhysicsField = {
    id: 'field',
    kind: 'timeStop',
    sourceSkill: 'time_sphere',
    casterId: 'field-caster',
    origin: { x: 0, z: 0 },
    radius: 5,
    startTimeTs: NOW,
    durationMs: 3500,
    excludedEntityIds: ['field-caster'],
    ...overrides,
  };
  state.activePhysicsFields[field.id] = field;
  return field;
}

function timeSphereImpact(casterId: string, targetId: string, pos: { x: number; z: number }): Cast {
  return {
    castId: 'time-sphere-cast',
    casterId,
    skillId: 'time_sphere',
    targetId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    target: { x: pos.x, z: pos.z },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function fireballCast(casterId: string, targetId: string | undefined, state: CastState): Cast {
  return {
    castId: `${casterId}-fireball`,
    casterId,
    skillId: 'fireball',
    targetId,
    state,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    targetPos: targetId ? { x: 20, z: 0 } : undefined,
    startedAt: NOW,
    castTimeMs: 1000,
  };
}
