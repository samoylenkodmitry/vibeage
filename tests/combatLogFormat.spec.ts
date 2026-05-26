import { describe, expect, it } from 'vitest';
import { formatCombatLogLine } from '../apps/client/src/clientVisualState';
import type { EnemyEntity, GameClientState } from '../apps/client/src/gameTypes';

/**
 * §49/M2 + §52 #6 — combat log readability. Verifies crit / miss /
 * heal suffixes and fall-through behavior for older server builds
 * that omit the optional parallel arrays.
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
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [12],
    })).toBe('Fireball hit Goblin for 12 damage');
  });
  it('appends (crit!) when any hit was a crit', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [24], crits: [true],
    })).toBe('Fireball hit Goblin for 24 damage (crit!)');
  });
  it('omits crit suffix when `crits` is undefined (backwards-compat)', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [10],
    })).toBe('Fireball hit Goblin for 10 damage');
  });
  it('aggregates multi-hit: one crit anywhere flags the line', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1', 'gob1'], damages: [10, 18], crits: [false, true],
    })).toContain('(crit!)');
  });
  // §52 #6 — misses
  it('renders "X missed Y" when the only target dodged', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [0], crits: [false], misses: [true],
    })).toBe('Fireball missed Goblin');
  });
  it('annotates AOE lines with the dodge count when only some targets missed', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1', 'gob1'], damages: [12, 0],
      crits: [false, false], misses: [false, true],
    })).toBe('Fireball hit Goblin for 12 damage (1 dodged)');
  });
  it('omits miss suffix when `misses` is undefined (backwards-compat with pre-§52 server)', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [10],
    })).toBe('Fireball hit Goblin for 10 damage');
  });
  // §52 #6 — heals
  it('renders "X healed Y for N" for a pure-heal cast (no damage)', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'holyLight', targets: ['gob1'], damages: [0],
      crits: [false], misses: [false], heals: [25],
    })).toBe('Holy Light healed Goblin for 25');
  });
  it('annotates mixed damage+heal casts with the heal amount', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [12],
      crits: [false], misses: [false], heals: [4],
    })).toBe('Fireball hit Goblin for 12 damage (+4 healed)');
  });
  it('omits the heal suffix when totalHeal is 0', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [12],
      crits: [false], misses: [false], heals: [0],
    })).toBe('Fireball hit Goblin for 12 damage');
  });
  it('falls through to damage line when both damage=0 and heal=0 (backwards-compat invuln-ate-it case)', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'fireball', targets: ['gob1'], damages: [0],
      crits: [false], misses: [false], heals: [0],
    })).toBe('Fireball hit Goblin for 0 damage');
  });
  it('renders a beneficial self-buff cast as "applied", not a 0-damage hit', () => {
    // Shield Wall has no .dmg and a beneficial (shield) effect — the
    // self-cast used to print "Shield Wall hit <you> for 0 damage".
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'shieldWall', targets: ['hero'], damages: [0], heals: [0], misses: [false],
    })).toBe('Shield Wall applied');
  });
  it('renders a non-damaging non-beneficial utility as "cast <target>"', () => {
    expect(formatCombatLogLine(makeStateWithGoblin(), {
      skillId: 'taunt', targets: ['gob1'], damages: [0], heals: [0], misses: [false],
    })).toBe('Taunt cast Goblin');
  });
});
