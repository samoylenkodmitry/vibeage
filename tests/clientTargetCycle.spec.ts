import { describe, expect, it } from 'vitest';
import { getNextTabTargetId } from '../apps/client/src/clientSelectors';
import type { EnemyEntity } from '../apps/client/src/gameTypes';

function makeEnemy(id: string, x: number, z: number, isAlive = true): EnemyEntity {
  return {
    id,
    name: id,
    level: 1,
    type: 'goblin',
    health: 100,
    maxHealth: 100,
    position: { x, y: 0.5, z },
    rotation: { x: 0, y: 0, z: 0 },
    isAlive,
    statusEffects: [],
  } as unknown as EnemyEntity;
}

describe('client target cycling (Tab)', () => {
  const origin = { x: 0, y: 0.5, z: 0 };

  it('returns the nearest enemy when no target is selected', () => {
    const enemies = {
      far: makeEnemy('far', 0, 20),
      near: makeEnemy('near', 0, 5),
      mid: makeEnemy('mid', 0, 10),
    };
    expect(getNextTabTargetId(enemies, origin, null)).toBe('near');
  });

  it('cycles to the next enemy by ascending distance', () => {
    const enemies = {
      far: makeEnemy('far', 0, 20),
      near: makeEnemy('near', 0, 5),
      mid: makeEnemy('mid', 0, 10),
    };
    // current = near → next = mid
    expect(getNextTabTargetId(enemies, origin, 'near')).toBe('mid');
    // current = mid → next = far
    expect(getNextTabTargetId(enemies, origin, 'mid')).toBe('far');
  });

  it('wraps around at the end of the list', () => {
    const enemies = {
      far: makeEnemy('far', 0, 20),
      near: makeEnemy('near', 0, 5),
    };
    // far is the last → wraps back to near
    expect(getNextTabTargetId(enemies, origin, 'far')).toBe('near');
  });

  it('returns the nearest enemy when the current target id is unknown (stale)', () => {
    const enemies = {
      near: makeEnemy('near', 0, 5),
      mid: makeEnemy('mid', 0, 10),
    };
    expect(getNextTabTargetId(enemies, origin, 'deceased')).toBe('near');
  });

  it('skips dead enemies', () => {
    const enemies = {
      deadNear: makeEnemy('deadNear', 0, 3, false),
      aliveMid: makeEnemy('aliveMid', 0, 10, true),
    };
    expect(getNextTabTargetId(enemies, origin, null)).toBe('aliveMid');
  });

  it('returns null when there are no live enemies', () => {
    const enemies = {
      ghost: makeEnemy('ghost', 0, 5, false),
    };
    expect(getNextTabTargetId(enemies, origin, null)).toBeNull();
  });

  it('re-selects the same enemy when it is the only one alive', () => {
    const enemies = {
      only: makeEnemy('only', 0, 5),
    };
    expect(getNextTabTargetId(enemies, origin, 'only')).toBe('only');
  });
});
