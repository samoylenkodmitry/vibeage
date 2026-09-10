import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState } from '../apps/client/src/gameTypes';

/**
 * The client half of mob cast interruption.
 *
 * The mechanic is server-authoritative, but it is invisible — worse,
 * *actively misleading* — without this: the telegraph ring grows toward an
 * impact that will never come, so a successful interrupt reads to the player
 * as one that failed. These tests pin the two things that make it legible:
 * the wind-up is retired, and the log says which control effect did it.
 */
const TELEGRAPH = {
  type: 'BossTelegraph' as const,
  enemyId: 'boss-1',
  bossName: 'Vorthax',
  abilityName: 'Void Nova',
  x: 10,
  z: -4,
  radius: 8,
  windUpMs: 3000,
  impactAt: 3000,
};

function withTelegraph(now = 0): GameClientState {
  return gameClientReducer(initialGameClientState, { type: 'serverMessage', message: TELEGRAPH, now });
}

function interrupt(state: GameClientState, reason: string, now = 1000): GameClientState {
  return gameClientReducer(state, {
    type: 'serverMessage',
    now,
    message: {
      type: 'CastInterrupted',
      castId: 'cast-9',
      casterId: 'boss-1',
      casterName: 'Vorthax',
      skillId: 'void_nova',
      abilityName: 'Void Nova',
      reason,
      interrupterId: 'me',
    },
  });
}

describe('CastInterrupted — retiring the wind-up', () => {
  it('drops the telegraph so the ring stops growing toward a phantom impact', () => {
    const casting = withTelegraph();
    expect(casting.bossTelegraphs).toHaveLength(1);
    expect(interrupt(casting, 'stun').bossTelegraphs).toHaveLength(0);
  });

  it('leaves another boss mid-channel alone', () => {
    // The store is keyed by caster; interrupting one must not clear the other.
    const two = gameClientReducer(withTelegraph(), {
      type: 'serverMessage',
      now: 0,
      message: { ...TELEGRAPH, enemyId: 'boss-2', bossName: 'Aethariel' },
    });
    expect(two.bossTelegraphs).toHaveLength(2);
    const after = interrupt(two, 'stun');
    expect(after.bossTelegraphs.map((t) => t.enemyId)).toEqual(['boss-2']);
  });

  it('is harmless when the client never saw the wind-up', () => {
    // A player who arrived late (or whose telegraph already expired) must not
    // get a broken state — just the log line.
    const after = interrupt(initialGameClientState, 'stun');
    expect(after.bossTelegraphs).toHaveLength(0);
    expect(after.combatLog.length).toBeGreaterThan(0);
  });
});

// The log is newest-first (`addCombatLine` prepends), so index 0 is the line
// the player just saw.
describe('CastInterrupted — the combat log', () => {
  it('names the control effect that broke the cast', () => {
    // Which tool worked is the thing worth learning; a generic "interrupted!"
    // teaches nothing about what to reach for next time.
    expect(interrupt(withTelegraph(), 'stun').combatLog[0]?.text)
      .toBe('Vorthax is stunned — Void Nova shatters!');
    expect(interrupt(withTelegraph(), 'silence').combatLog[0]?.text)
      .toBe('Vorthax is silenced — Void Nova shatters!');
    expect(interrupt(withTelegraph(), 'knockback').combatLog[0]?.text)
      .toBe('Vorthax is knocked off the mark — Void Nova shatters!');
  });

  it('still reads sensibly for a reason the server adds later', () => {
    expect(interrupt(withTelegraph(), 'polymorph').combatLog[0]?.text)
      .toBe("Vorthax's Void Nova is interrupted!");
  });

  it('logs it as a utility that landed, not as damage', () => {
    expect(interrupt(withTelegraph(), 'stun').combatLog[0]?.tone).toBe('buff');
  });
});

describe('BossTelegraph — unstoppable', () => {
  it('carries the flag through to the HUD so a player does not waste a stun', () => {
    const state = gameClientReducer(initialGameClientState, {
      type: 'serverMessage',
      now: 0,
      message: { ...TELEGRAPH, unstoppable: true },
    });
    expect(state.bossTelegraphs[0].unstoppable).toBe(true);
    // …and stays absent on an ordinary, breakable wind-up.
    expect(withTelegraph().bossTelegraphs[0].unstoppable).toBeUndefined();
  });
});
