import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CastState, type StatusEffect } from '../packages/protocol/messages';
import type { Enemy, PlayerState } from '../packages/sim/entities';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { resetDotTrackerForTests, tickDamageOverTimeEffects } from '../server/combat/dotTicker';
import type { Cast } from '../server/combat/skillSystem';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState, type GameState } from '../server/gameState';
import { advanceAll } from '../server/movement/worldMovement';
import { createTransientPlayer } from '../server/playerFactory';
import { handleResourceRegeneration } from '../server/players/playerLifecycle';
import type { AreaPhysicsField } from '../server/physics/areaPhysics';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  resetDotTrackerForTests();
});

describe('time-stop status-effect clocks', () => {
  it('pauses existing status-effect expiry while the target is inside stopped time', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const target = player('target', 0, 0);
    const effect = statusEffect('slow', { durationMs: 1_000, startTimeTs: NOW });
    target.statusEffects = [effect];
    state.players[target.id] = target;
    insert(spatial, target);
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });

    advanceAll(state, spatial, 1_000, NOW + 1_000);
    advanceAll(state, spatial, 1_000, NOW + 2_000);
    advanceAll(state, spatial, 1_000, NOW + 3_000);

    expect(target.statusEffects).toHaveLength(1);
    expect(effect.startTimeTs).toBe(NOW + 3_000);

    advanceAll(state, spatial, 600, NOW + 3_600);
    expect(state.activePhysicsFields.field).toBeUndefined();
    expect(target.statusEffects).toHaveLength(1);

    advanceAll(state, spatial, 400, NOW + 4_000);
    expect(target.statusEffects).toEqual([]);
  });

  it('allows applying debuffs to a frozen target, then freezes the new debuff duration', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const caster = player('caster', -10, 0);
    const target = enemy('target', 0, 0);
    state.players[caster.id] = caster;
    state.enemies[target.id] = target;
    insert(spatial, caster);
    insert(spatial, target);
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });

    resolveCastImpact(
      impactCast(caster.id, 'target', 'iceBolt'),
      outbound,
      createWorldCombatBridge(state, outbound, spatial),
      NOW + 100,
    );

    const slow = target.statusEffects.find((effect) => effect.type === 'slow');
    const poison = target.statusEffects.find((effect) => effect.type === 'poison');
    expect(slow?.startTimeTs).toBe(NOW + 100);
    expect(poison?.startTimeTs).toBe(NOW + 100);

    advanceAll(state, spatial, 1_000, NOW + 1_100);

    expect(slow?.startTimeTs).toBe(NOW + 1_100);
    expect(poison?.startTimeTs).toBe(NOW + 1_100);
    expect(target.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);
    expect(target.statusEffects.some((effect) => effect.type === 'poison')).toBe(true);
  });
});

describe('time-stop ticking resources', () => {
  it('pauses DoT ticks without catch-up damage after stopped time ends', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    const target = player('target', 0, 0);
    target.health = 100;
    target.statusEffects = [statusEffect('burn', { value: 10, durationMs: 5_000, startTimeTs: NOW })];
    state.players[target.id] = target;
    insert(spatial, target);
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });

    for (const offsetMs of [1_000, 2_000, 3_000]) {
      advanceAll(state, spatial, 1_000, NOW + offsetMs);
      tickDamageOverTimeEffects(state, spatial, outbound, NOW + offsetMs);
      expect(target.health).toBe(100);
    }

    advanceAll(state, spatial, 600, NOW + 3_600);
    tickDamageOverTimeEffects(state, spatial, outbound, NOW + 3_600);
    expect(target.health).toBe(100);

    advanceAll(state, spatial, 400, NOW + 4_000);
    tickDamageOverTimeEffects(state, spatial, outbound, NOW + 4_000);
    expect(target.health).toBe(90);
  });

  it('pauses hp and mp regen without banking frozen elapsed time', () => {
    const state = createGameState();
    const target = player('target', 0, 0);
    target.health = 50;
    target.mana = 50;
    target.maxHealth = 100;
    target.maxMana = 100;
    target.stats = { hpRegen: 10, mpRegen: 10 };
    target.lastRegenTimeMs = NOW;
    state.players[target.id] = target;
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });
    const outbound = { publish: vi.fn() };

    for (const offsetMs of [1_000, 2_000, 3_000]) {
      handleResourceRegeneration(state, outbound, NOW + offsetMs);
      expect(target.health).toBe(50);
      expect(target.mana).toBe(50);
      expect(target.lastRegenTimeMs).toBe(NOW + offsetMs);
    }

    handleResourceRegeneration(state, outbound, NOW + 3_600);

    expect(target.health).toBeCloseTo(56, 4);
    expect(target.mana).toBeCloseTo(56, 4);
  });
});

describe('time-stop reusable local clocks', () => {
  it('pauses cooldown and enemy AI deadlines as reusable local clocks', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const frozenPlayer = player('target', 0, 0);
    frozenPlayer.skillCooldownEndTs = { fireball: NOW + 2_000 };
    const frozenEnemy = enemy('enemy', 0, 1);
    frozenEnemy.skillCooldownEndTs = { mobStrike: NOW + 2_000 };
    frozenEnemy.lastAttackTime = NOW;
    frozenEnemy.patrolWaitUntilTs = NOW + 2_000;
    frozenEnemy.aggroSuppressedUntilTs = NOW + 2_000;
    frozenEnemy.chaseStartedAt = NOW;
    frozenEnemy.combatStartedTs = NOW;
    state.players[frozenPlayer.id] = frozenPlayer;
    state.enemies[frozenEnemy.id] = frozenEnemy;
    insert(spatial, frozenPlayer);
    insert(spatial, frozenEnemy);
    addTimeField(state, { origin: { x: 0, z: 0 }, radius: 5 });

    advanceAll(state, spatial, 1_000, NOW + 1_000);

    expect(frozenPlayer.skillCooldownEndTs.fireball).toBe(NOW + 3_000);
    expect(frozenEnemy.skillCooldownEndTs?.mobStrike).toBe(NOW + 3_000);
    expect(frozenEnemy.lastAttackTime).toBe(NOW + 1_000);
    expect(frozenEnemy.patrolWaitUntilTs).toBe(NOW + 3_000);
    expect(frozenEnemy.aggroSuppressedUntilTs).toBe(NOW + 3_000);
    expect(frozenEnemy.chaseStartedAt).toBe(NOW + 1_000);
    expect(frozenEnemy.combatStartedTs).toBe(NOW + 1_000);
  });
});

function player(id: string, x: number, z: number): PlayerState {
  const p = createTransientPlayer(`${id}-socket`, id);
  p.id = id;
  p.position = { x, y: 0.5, z };
  p.level = 40;
  p.unlockedSkills = ['fireball', 'iceBolt', 'time_sphere'];
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
    durationMs: 3_500,
    excludedEntityIds: ['field-caster'],
    ...overrides,
  };
  state.activePhysicsFields[field.id] = field;
  return field;
}

function statusEffect(type: string, overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: `${type}-1`,
    type,
    value: 1,
    durationMs: 5_000,
    startTimeTs: NOW,
    sourceSkill: 'test',
    ...overrides,
  };
}

function impactCast(casterId: string, targetId: string, skillId: Cast['skillId']): Cast {
  return {
    castId: `${casterId}-${skillId}`,
    casterId,
    skillId,
    targetId,
    state: CastState.Impact,
    origin: { x: -10, z: 0 },
    pos: { x: -10, z: 0 },
    target: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
  };
}
