import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import { isUnauthorizedRejection } from '../apps/client/src/roomConnection';
import { WORLD_JOIN_REJECTION } from '../packages/protocol/sessionEvents';

/**
 * Expired-session recovery.
 *
 * When a returning player's saved session token has expired, the world join is
 * rejected. Before this fix the client re-presented the same dead token on
 * every reconnect, exhausted its retries, and stranded the player in the world
 * with no hero and no reachable login. The fix rests on two pieces this spec
 * pins down:
 *
 *  1. `isUnauthorizedRejection` — distinguishes an auth rejection (clear the
 *     session, re-auth) from a transient drop (keep retrying the same token).
 *     Getting this wrong in either direction is a real bug: a false positive
 *     logs players out on a blip; a false negative re-traps them.
 *  2. the `sessionExpired` reducer transition — resets to a clean slate so no
 *     stale hero lingers behind the recovery UI.
 */
describe('isUnauthorizedRejection', () => {
  it('flags a ServerError-shaped rejection carrying the unauthorized code', () => {
    expect(isUnauthorizedRejection({ code: WORLD_JOIN_REJECTION.unauthorized, message: 'x' })).toBe(true);
  });

  it('flags a real Error instance decorated with the code (Colyseus ServerError)', () => {
    const err = Object.assign(new Error('Your session expired — please log in again.'), {
      code: WORLD_JOIN_REJECTION.unauthorized,
    });
    expect(isUnauthorizedRejection(err)).toBe(true);
  });

  it('does NOT flag transient / unrelated failures (keeps them on the retry path)', () => {
    // Generic application error during onJoin (Colyseus APPLICATION_ERROR).
    expect(isUnauthorizedRejection({ code: 526, message: 'boom' })).toBe(false);
    // Abnormal WS closure (server unreachable) — must keep retrying the token.
    expect(isUnauthorizedRejection({ code: 1006 })).toBe(false);
    // A plain thrown Error with no code.
    expect(isUnauthorizedRejection(new Error('Disconnected from the game server.'))).toBe(false);
    // Non-error rejections.
    expect(isUnauthorizedRejection(null)).toBe(false);
    expect(isUnauthorizedRejection(undefined)).toBe(false);
    expect(isUnauthorizedRejection('nope')).toBe(false);
    expect(isUnauthorizedRejection({ code: `${WORLD_JOIN_REJECTION.unauthorized}` })).toBe(false);
  });
});

describe('gameClientReducer — sessionExpired', () => {
  it('resets to a clean slate in the sessionExpired state with the message', () => {
    const dirty = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      message: 'Online',
      myPlayerId: 'me',
      players: { me: { id: 'me' } } as never,
    };
    const next = gameClientReducer(dirty, {
      type: 'sessionExpired',
      message: 'Your session expired — please log in again.',
    });
    expect(next.connectionState).toBe('sessionExpired');
    expect(next.message).toBe('Your session expired — please log in again.');
    // Clean slate: no stale hero/world lingering behind the recovery UI.
    expect(next.myPlayerId).toBe(initialGameClientState.myPlayerId);
    expect(next.players).toEqual(initialGameClientState.players);
  });
});
