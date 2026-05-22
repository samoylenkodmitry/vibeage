import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';

/**
 * ROADMAP — reducer tests for disconnected / reconnected transitions.
 *
 * Pins the connection-state machine the HUD reads to gate its
 * "Connecting…" / "Rejoining…" overlays and the reconnect handshake.
 *
 *   offline → connecting → joining → online
 *                    ↘                  ↓
 *                  rejected         offline (network drop)
 *
 * The bug shape this guards against: a stray `disconnected` while
 * already offline shouldn't lock the client out of reconnecting, and
 * a `startConnecting` after a real-disconnect must clear the
 * previous-session player roster (otherwise the HUD draws ghost
 * players for the gap until the next `gameState` snapshot arrives).
 */

function makePlayer(id: string, overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id,
    name: id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    isAlive: true,
    unlockedSkills: [],
    skillLevels: {},
    ...overrides,
  } as unknown as PlayerEntity;
}

describe('gameClientReducer — connection transitions', () => {
  it('startConnecting sets connectionState=connecting and resets to a clean baseline', () => {
    const messy: GameClientState = {
      ...initialGameClientState,
      myPlayerId: 'me',
      connectionState: 'offline' as const,
      players: { me: makePlayer('me') },
    };
    const next = gameClientReducer(messy, { type: 'startConnecting' });
    expect(next.connectionState).toBe('connecting');
    // §52 polish — startConnecting deliberately clears the prior
    // session's roster so the HUD doesn't paint ghost players in the
    // gap before the next `gameState` snapshot.
    expect(next.players).toEqual({});
    expect(next.myPlayerId).toBeNull();
  });

  it('connected → joining (handshake midpoint)', () => {
    const connecting = gameClientReducer(initialGameClientState, { type: 'startConnecting' });
    const next = gameClientReducer(connecting, { type: 'connected' });
    expect(next.connectionState).toBe('joining');
  });

  it('joined sets connectionState=online and pins myPlayerId', () => {
    const connecting = gameClientReducer(initialGameClientState, { type: 'startConnecting' });
    const connected = gameClientReducer(connecting, { type: 'connected' });
    const joined = gameClientReducer(connected, { type: 'joined', playerId: 'me' });
    expect(joined.connectionState).toBe('online');
    expect(joined.myPlayerId).toBe('me');
  });
});

describe('gameClientReducer — disconnect + reconnect flow', () => {
  it('disconnected from online drops the session into offline with the server message', () => {
    const seeded: GameClientState = {
      ...initialGameClientState,
      myPlayerId: 'me',
      connectionState: 'online' as const,
      players: { me: makePlayer('me') },
    };
    const next = gameClientReducer(seeded, { type: 'disconnected', message: 'Lost connection' });
    expect(next.connectionState).toBe('offline');
    expect(next.message).toBe('Lost connection');
  });

  it('a stray disconnected while already offline is idempotent on connection state', () => {
    const offline: GameClientState = {
      ...initialGameClientState,
      connectionState: 'offline' as const,
      message: 'old',
    };
    const next = gameClientReducer(offline, { type: 'disconnected', message: 'new' });
    expect(next.connectionState).toBe('offline');
    expect(next.message).toBe('new');
  });

  it('reconnection: offline → startConnecting clears prior-session roster (no ghost players)', () => {
    const dropped: GameClientState = {
      ...initialGameClientState,
      myPlayerId: 'me',
      connectionState: 'offline' as const,
      players: { me: makePlayer('me'), other: makePlayer('other') },
      enemies: {},
    };
    const reconnecting = gameClientReducer(dropped, { type: 'startConnecting' });
    expect(reconnecting.players).toEqual({});
    expect(reconnecting.myPlayerId).toBeNull();
  });

  it('a fresh joined picks the new playerId, not the stale one', () => {
    const reconnecting = gameClientReducer(initialGameClientState, { type: 'startConnecting' });
    const connected = gameClientReducer(reconnecting, { type: 'connected' });
    const joined = gameClientReducer(connected, { type: 'joined', playerId: 'new-session-id' });
    expect(joined.myPlayerId).toBe('new-session-id');
  });
});

describe('gameClientReducer — connectionRejected', () => {
  it('connectionRejected lands in `rejected` with the server message', () => {
    const connecting = gameClientReducer(initialGameClientState, { type: 'startConnecting' });
    const next = gameClientReducer(connecting, {
      type: 'connectionRejected',
      message: 'Server is full',
    });
    expect(next.connectionState).toBe('rejected');
    expect(next.message).toBe('Server is full');
  });

  it('a subsequent startConnecting from `rejected` recovers to connecting (recoverable terminal)', () => {
    const rejected = gameClientReducer(initialGameClientState, {
      type: 'connectionRejected', message: 'Server is full',
    });
    const next = gameClientReducer(rejected, { type: 'startConnecting' });
    expect(next.connectionState).toBe('connecting');
  });
});
