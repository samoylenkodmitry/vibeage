import { describe, expect, it } from 'vitest';
import { applyCastFailFromCommandRejected } from '../apps/client/src/clientVisualState';
import type { GameClientState } from '../apps/client/src/gameTypes';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §52 polish — friendly copy for CastReq rejection reasons in the
 * combat log. Pre-PR the line read "Cast failed: outofrange" with the
 * raw enum string; now it reads "Cast failed: target out of range."
 * Unknown reasons fall through to the raw text so server-side reason
 * additions still surface without lying.
 */

function emptyState(): GameClientState {
  return { enemies: {}, players: {}, combatLog: [] } as unknown as GameClientState;
}

function reject(reason: string): ServerMessage & { type: 'CommandRejected' } {
  return { type: 'CommandRejected', commandType: 'CastReq', reason };
}

describe('castFailCopy via applyCastFailFromCommandRejected', () => {
  it('renders friendly copy for cooldown', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('cooldown'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: still on cooldown.');
  });
  it('renders friendly copy for nomana', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('nomana'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: not enough mana.');
  });
  it('renders friendly copy for outofrange', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('outofrange'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: target out of range.');
  });
  it('renders friendly copy for invalid', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('invalid'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: invalid target.');
  });
  it('renders friendly copy for missingTarget', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('missingTarget'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: pick a target first.');
  });
  it('renders friendly copy for targetNotFound', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('targetNotFound'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: target is gone.');
  });
  it('falls through to raw reason for unknown strings (no information loss)', () => {
    const next = applyCastFailFromCommandRejected(emptyState(), reject('some_future_reason'), 0);
    expect(next.combatLog[0].text).toBe('Cast failed: some_future_reason');
  });
});
