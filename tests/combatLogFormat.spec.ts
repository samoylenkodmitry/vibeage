import { describe, expect, it } from 'vitest';
import { formatCombatLogLine } from '../apps/client/src/clientVisualState';
import type { EnemyEntity, GameClientState } from '../apps/client/src/gameTypes';

/**
 * §49/M2 — combat log readability. Verifies the crit suffix appears
 * when any hit in the message was a crit and stays absent for
 * vanilla swings + pre-§49/M2 server builds that omit `crits`.
 */

function makeStateWithGoblin(): GameClientState {
  const goblin = {
    id: 'gob1', name: 'Goblin', isAlive: true,
    position: { x: 0, y: 0, z: 0 },
  } as unknown as EnemyEntity;
  return {
    enemies: { gob1: goblin },
    players: {},
    combatLog: [],
  } as unknown as GameClientState;
}

describe('formatCombatLogLine', () => {
  it('renders a plain hit with no crit suffix', () => {
    const state = makeStateWithGoblin();
    expect(formatCombatLogLine(state, 'fireball', ['gob1'], [12])).toBe(
      'Fireball hit Goblin for 12 damage',
    );
  });
  it('appends (crit!) when any hit was a crit', () => {
    const state = makeStateWithGoblin();
    expect(formatCombatLogLine(state, 'fireball', ['gob1'], [24], [true])).toBe(
      'Fireball hit Goblin for 24 damage (crit!)',
    );
  });
  it('omits crit suffix when `crits` is undefined (backwards-compat)', () => {
    const state = makeStateWithGoblin();
    expect(formatCombatLogLine(state, 'fireball', ['gob1'], [10], undefined)).toBe(
      'Fireball hit Goblin for 10 damage',
    );
  });
  it('aggregates multi-hit: one crit anywhere flags the line', () => {
    const state = makeStateWithGoblin();
    expect(formatCombatLogLine(state, 'fireball', ['gob1', 'gob1'], [10, 18], [false, true])).toContain('(crit!)');
  });
});
