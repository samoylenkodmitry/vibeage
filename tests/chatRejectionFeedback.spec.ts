import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';

/**
 * §52 polish — ChatRequest rejections surface inline in the ChatPanel
 * via `state.lastChatError`. The other CommandRejected commandTypes
 * route to the combat log; chat has its own UI surface (the panel)
 * and shouldn't pollute the combat log with chat errors.
 *
 * State machine:
 *   1. ChatRequest rejected → `lastChatError = { reason, at }`
 *   2. Local-player ChatBroadcast arrives → `lastChatError = null`
 *      (the broadcast confirms a later send succeeded)
 *   3. Other-player ChatBroadcast → `lastChatError` untouched
 */

const baseState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: 'me',
};

describe('gameClientReducer — ChatRequest rejection state', () => {
  it('stores the rejection reason on lastChatError', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'ChatRequest', reason: 'rateLimited' },
    });
    expect(next.lastChatError).toEqual({ reason: 'rateLimited', at: 100 });
  });

  it('does NOT add a combat-log line (chat error should stay in the panel)', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'ChatRequest', reason: 'emptyText' },
    });
    expect(next.combatLog).toEqual([]);
  });

  it('overwrites a prior chat error with the latest reason', () => {
    const seeded = { ...baseState, lastChatError: { reason: 'rateLimited', at: 50 } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 200,
      message: { type: 'CommandRejected', commandType: 'ChatRequest', reason: 'emptyText' },
    });
    expect(next.lastChatError).toEqual({ reason: 'emptyText', at: 200 });
  });

  it('clears the error when the local player\'s next ChatBroadcast arrives', () => {
    const seeded = { ...baseState, lastChatError: { reason: 'rateLimited', at: 50 } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 200,
      message: {
        type: 'ChatBroadcast',
        fromId: 'me', fromName: 'me',
        text: 'hi', scope: 'all', ts: 200,
      },
    });
    expect(next.lastChatError).toBeNull();
  });

  it('leaves the error alone when an OTHER player\'s ChatBroadcast arrives', () => {
    const seeded = { ...baseState, lastChatError: { reason: 'rateLimited', at: 50 } };
    const next = gameClientReducer(seeded, {
      type: 'serverMessage', now: 200,
      message: {
        type: 'ChatBroadcast',
        fromId: 'other', fromName: 'other',
        text: 'hi', scope: 'all', ts: 200,
      },
    });
    expect(next.lastChatError).toEqual({ reason: 'rateLimited', at: 50 });
  });

  it('initial state has lastChatError = null', () => {
    expect(initialGameClientState.lastChatError).toBeNull();
  });
});
