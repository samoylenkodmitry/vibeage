import { describe, expect, test, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { updateTravelingCast } from '../server/combat/projectileRuntime';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { Enemy, PlayerState } from '../shared/types';

describe('projectile runtime', () => {
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

    updateTravelingCast(cast, 0, 100, 50, { emit: vi.fn() } as any, world);

    expect(cast.dir?.x).toBeCloseTo(0);
    expect(cast.dir?.z).toBeCloseTo(1);
  });
});
