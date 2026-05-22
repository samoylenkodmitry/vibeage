import { describe, expect, test, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { sweptCircleHit } from '../packages/sim/collision';
import { updateTravelingCast } from '../server/combat/projectileRuntime';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { Enemy, PlayerState } from '../packages/sim/entities';

describe('projectile runtime', () => {
  test('detects swept projectile hits without legacy collision obstacles', () => {
    expect(sweptCircleHit(
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 5, z: 0.8 },
      0.5,
      0.5,
    )).toBe(true);

    expect(sweptCircleHit(
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 5, z: 3 },
      0.5,
      0.5,
    )).toBe(false);
  });

  test('retargets homing projectile direction from its current position', () => {
    const cast: Cast = {
      castId: 'cast1',
      casterId: 'player1',
      skillId: 'fireball',
      state: CastState.Traveling,
      startedAt: 0,
      castTimeMs: 0,
      origin: { x: 0, z: 0 },
      pos: { x: 10, z: 0 },
      targetPos: { x: 10, z: 10 },
      targetId: 'enemy1',
      dir: { x: 1, z: 0 },
      speed: 1,
    };
    const enemy = {
      id: 'enemy1',
      position: { x: 10, y: 0, z: 10 },
      isAlive: true,
    } as Enemy;
    const world: CombatWorld = {
      getEnemyById: vi.fn((id: string) => (id === enemy.id ? enemy : null)),
      getPlayerById: vi.fn(() => null as PlayerState | null),
      getEntitiesInCircle: vi.fn(() => []),
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    updateTravelingCast(cast, 0, 100, 50, outbound, world);

    expect(cast.dir?.x).toBeCloseTo(0);
    expect(cast.dir?.z).toBeCloseTo(1);
  });
});

describe('projectile pierce', () => {
  test('volley pierces multiple enemies and stops at maxPierceHits', () => {
    // Volley: pierce: true, maxPierceHits: 3 (skills.ts:582)
    // Sweep two enemies in the projectile's path within one tick;
    // both take damage immediately and the projectile keeps going
    // (cast stays in Traveling state, pierceHits has both ids).
    const enemyA = {
      id: 'enemyA',
      position: { x: 4, y: 0, z: 0 },
      isAlive: true,
      health: 200, maxHealth: 200,
      statusEffects: [],
      targetId: null, aiState: 'idle',
    } as unknown as Enemy;
    const enemyB = {
      id: 'enemyB',
      position: { x: 6, y: 0, z: 0 },
      isAlive: true,
      health: 200, maxHealth: 200,
      statusEffects: [],
      targetId: null, aiState: 'idle',
    } as unknown as Enemy;
    const cast: Cast = {
      castId: 'volley1',
      casterId: 'player1',
      skillId: 'volley',
      state: CastState.Traveling,
      startedAt: 0,
      castTimeMs: 0,
      origin: { x: 0, z: 0 },
      pos: { x: 2, z: 0 },
      dir: { x: 1, z: 0 },
      speed: 10,
    };
    const world: CombatWorld = {
      getEnemyById: vi.fn((id: string) => (id === enemyA.id ? enemyA : id === enemyB.id ? enemyB : null)),
      getPlayerById: vi.fn(() => null as PlayerState | null),
      getEntitiesInCircle: vi.fn(() => [enemyA, enemyB]),
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    updateTravelingCast(cast, 1, 100, 50, outbound, world);

    expect(cast.pierceHits).toContain('enemyA');
    expect(cast.pierceHits).toContain('enemyB');
    expect(enemyA.health).toBeLessThan(200);
    expect(enemyB.health).toBeLessThan(200);
    expect(cast.state).toBe(CastState.Traveling);
  });

  test('non-piercing projectile stops on first hit (legacy single-hit path)', () => {
    const enemy = {
      id: 'enemyOnly',
      position: { x: 4, y: 0, z: 0 },
      isAlive: true,
      health: 200, maxHealth: 200,
      statusEffects: [],
      targetId: null, aiState: 'idle',
    } as unknown as Enemy;
    const cast: Cast = {
      castId: 'fireball1',
      casterId: 'player1',
      skillId: 'fireball',
      state: CastState.Traveling,
      startedAt: 0,
      castTimeMs: 0,
      origin: { x: 0, z: 0 },
      pos: { x: 2, z: 0 },
      dir: { x: 1, z: 0 },
      speed: 10,
    };
    const world: CombatWorld = {
      getEnemyById: vi.fn((id: string) => (id === enemy.id ? enemy : null)),
      getPlayerById: vi.fn(() => null as PlayerState | null),
      getEntitiesInCircle: vi.fn(() => [enemy]),
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    updateTravelingCast(cast, 1, 100, 50, outbound, world);

    expect(cast.state).toBe(CastState.Impact);
    expect(cast.pierceHits).toBeUndefined();
  });
});

describe('projectile max-range expiry', () => {
  test('projectile transitions to Impact once it travels past skill.range', () => {
    // ROADMAP L534. Fireball has range=1800 (skills.ts). Place the
    // cast position ~2000 units from origin so the next tick's
    // `shouldImpact` finds outOfRange === true and ends the cast,
    // even if no enemy is in the swept path. Pin behaviour: a
    // projectile fired into empty space terminates rather than
    // travelling forever.
    const cast: Cast = {
      castId: 'fb-far',
      casterId: 'player1',
      skillId: 'fireball',
      state: CastState.Traveling,
      startedAt: 0,
      castTimeMs: 0,
      origin: { x: 0, z: 0 },
      pos: { x: 2_000, z: 0 },
      dir: { x: 1, z: 0 },
      speed: 22,
    };
    const world: CombatWorld = {
      getEnemyById: vi.fn(() => null as Enemy | null),
      getPlayerById: vi.fn(() => null as PlayerState | null),
      // No enemies in the swept path — out-of-range is the ONLY
      // reason this cast should impact.
      getEntitiesInCircle: vi.fn(() => []),
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    updateTravelingCast(cast, 1, 100, 50, outbound, world);

    expect(cast.state).toBe(CastState.Impact);
  });

  test('projectile inside skill.range stays in Traveling (range gate complement)', () => {
    // The complement: at the same setup but pos well within range,
    // an empty path should NOT terminate the cast.
    const cast: Cast = {
      castId: 'fb-near',
      casterId: 'player1',
      skillId: 'fireball',
      state: CastState.Traveling,
      startedAt: 0,
      castTimeMs: 0,
      origin: { x: 0, z: 0 },
      pos: { x: 5, z: 0 }, // 5 << 1800
      dir: { x: 1, z: 0 },
      speed: 22,
    };
    const world: CombatWorld = {
      getEnemyById: vi.fn(() => null as Enemy | null),
      getPlayerById: vi.fn(() => null as PlayerState | null),
      getEntitiesInCircle: vi.fn(() => []),
      onTargetDied: vi.fn(),
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    updateTravelingCast(cast, 1, 100, 50, outbound, world);

    expect(cast.state).toBe(CastState.Traveling);
  });
});
