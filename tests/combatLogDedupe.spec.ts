import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState } from '../apps/client/src/gameTypes';

/**
 * §52 polish — consecutive-duplicate combat-log lines collapse into
 * a single row with `count` bumped, so spamming a skill on cooldown
 * reads as "Cast failed: still on cooldown. (×5)" instead of five
 * identical rows.
 *
 * The collapse only applies to the TOP line (most recent). A line
 * of a different shape in between resets the chain — the next dup
 * starts a fresh entry. This matches how chat clients render
 * sequential identical messages without losing intermediate detail.
 */

const baseState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: 'me',
};

function castReject(seq: number) {
  return {
    type: 'serverMessage' as const,
    now: 100 + seq,
    message: { type: 'CommandRejected' as const, commandType: 'CastReq', reason: 'cooldown', requestId: seq },
  };
}

describe('combat log — consecutive-duplicate collapse', () => {
  it('collapses two identical rejections into one row with count=2', () => {
    let state: GameClientState = baseState;
    state = gameClientReducer(state, castReject(1));
    state = gameClientReducer(state, castReject(2));
    expect(state.combatLog).toHaveLength(1);
    expect(state.combatLog[0].count).toBe(2);
    expect(state.combatLog[0].text).toBe('Cast failed: still on cooldown.');
  });

  it('increments the count further on additional duplicates', () => {
    let state: GameClientState = baseState;
    for (let i = 0; i < 5; i += 1) {
      state = gameClientReducer(state, castReject(i));
    }
    expect(state.combatLog).toHaveLength(1);
    expect(state.combatLog[0].count).toBe(5);
  });

  it('does NOT collapse a different message in between (chain resets)', () => {
    let state: GameClientState = baseState;
    state = gameClientReducer(state, castReject(1));
    // Different rejection reason → new row.
    state = gameClientReducer(state, {
      type: 'serverMessage', now: 200,
      message: { type: 'CommandRejected', commandType: 'CastReq', reason: 'nomana' },
    });
    state = gameClientReducer(state, castReject(3));
    expect(state.combatLog).toHaveLength(3);
    // Newest at index 0 — the cooldown line is back as a fresh row,
    // not merged with the older cooldown line below the nomana break.
    expect(state.combatLog[0].count).toBeUndefined();
    expect(state.combatLog[0].text).toBe('Cast failed: still on cooldown.');
    expect(state.combatLog[1].text).toBe('Cast failed: not enough mana.');
    expect(state.combatLog[2].text).toBe('Cast failed: still on cooldown.');
  });

  it('first occurrence has no count field (only set when actually collapsed)', () => {
    const state = gameClientReducer(baseState, castReject(1));
    expect(state.combatLog).toHaveLength(1);
    expect(state.combatLog[0].count).toBeUndefined();
  });
});
