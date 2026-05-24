import { describe, expect, it } from 'vitest';
import { addCombatDamageVisualEvents } from '../apps/client/src/combatFeedback';
import type { EnemyEntity, GameClientState, VisualEvent } from '../apps/client/src/gameTypes';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * PRs 603 + 604 — visual differentiation for crits and misses.
 * combatFeedback.ts is the single chokepoint that turns a CombatLog
 * server message into the floating-number / "MISS" sprites.
 *
 * These tests pin its contract:
 *   - damage > 0, miss=false → 'damage' event carrying isCrit
 *   - miss=true              → 'miss' event with no amount
 *   - damage = 0, miss=false → nothing (no zero-amount sprite)
 *
 * Without these, a future server change that flips the crit flag
 * shape (or starts sending damage=0 for whiffs) could silently
 * remove the new feedback.
 */

function makeEnemy(id: string): EnemyEntity {
  return {
    id,
    type: 'goblin',
    name: 'Goblin',
    level: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 10,
    maxHealth: 10,
    isAlive: true,
  };
}

function makeState(enemyId: string): GameClientState {
  return {
    enemies: { [enemyId]: makeEnemy(enemyId) },
    players: {},
    visualEvents: {},
    nextVisualEventSeq: 0,
    combatLog: [],
  } as unknown as GameClientState;
}

function combatLog(opts: {
  targets: string[];
  damages: number[];
  crits?: boolean[];
  misses?: boolean[];
}): ServerMessage & { type: 'CombatLog' } {
  return {
    type: 'CombatLog',
    castId: 'cast-1',
    skillId: 'basicAttack',
    casterId: 'p1',
    targets: opts.targets,
    damages: opts.damages,
    crits: opts.crits,
    misses: opts.misses,
  } as ServerMessage & { type: 'CombatLog' };
}

function eventsOf(state: GameClientState): VisualEvent[] {
  return Object.values(state.visualEvents);
}

describe('addCombatDamageVisualEvents', () => {
  it('emits a damage event carrying isCrit=true for a crit hit', () => {
    const next = addCombatDamageVisualEvents(
      makeState('g1'),
      combatLog({ targets: ['g1'], damages: [37], crits: [true] }),
      1000,
    );
    const events = eventsOf(next);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('damage');
    expect(events[0].amount).toBe(37);
    expect(events[0].isCrit).toBe(true);
  });

  it('emits a damage event with isCrit=false for a normal hit', () => {
    const next = addCombatDamageVisualEvents(
      makeState('g1'),
      combatLog({ targets: ['g1'], damages: [12] }),
      1000,
    );
    const events = eventsOf(next);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('damage');
    expect(events[0].isCrit).toBe(false);
  });

  it('emits a miss event (no amount) when message.misses[i] is true', () => {
    const next = addCombatDamageVisualEvents(
      makeState('g1'),
      combatLog({ targets: ['g1'], damages: [0], misses: [true] }),
      1000,
    );
    const events = eventsOf(next);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('miss');
    expect(events[0].amount).toBeUndefined();
  });

  it('emits no event when damage is 0 and miss is false', () => {
    const next = addCombatDamageVisualEvents(
      makeState('g1'),
      combatLog({ targets: ['g1'], damages: [0] }),
      1000,
    );
    expect(eventsOf(next)).toHaveLength(0);
  });

  it('emits a separate event per target in an AOE log', () => {
    const state = {
      ...makeState('g1'),
      enemies: { g1: makeEnemy('g1'), g2: makeEnemy('g2'), g3: makeEnemy('g3') },
    } as GameClientState;
    const next = addCombatDamageVisualEvents(
      state,
      combatLog({
        targets: ['g1', 'g2', 'g3'],
        damages: [10, 0, 20],
        crits: [false, false, true],
        misses: [false, true, false],
      }),
      1000,
    );
    const events = eventsOf(next).sort((a, b) => a.createdAt - b.createdAt);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ kind: 'damage', amount: 10, isCrit: false });
    expect(events[1]).toMatchObject({ kind: 'miss' });
    expect(events[2]).toMatchObject({ kind: 'damage', amount: 20, isCrit: true });
  });
});
