import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { forgetSocketRateLimits } from '../server/world/rateLimiter';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { forgetMovementFreshness } from '../server/movement/staleIntentTracker';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => { events.push(e); } } };
}

function placePlayer(state: ReturnType<typeof createGameState>, spatial: SpatialHashGrid, id: string, socketId: string, x: number): PlayerState {
  const player = createTransientPlayer(socketId, id);
  player.id = id;
  player.position = { x, y: 0.5, z: 0 };
  state.players[id] = player;
  spatial.insert(id, { x, z: 0 });
  return player;
}

function dispatch(state: ReturnType<typeof createGameState>, spatial: SpatialHashGrid, socketId: string, msg: { type: 'ChatRequest'; text: string; scope: 'near' | 'all'; clientTs: number }, sink: OutboundEventSink): void {
  const socket = { id: socketId, emit: vi.fn() };
  handleClientMessage(socket, state, msg, sink, spatial);
}

describe('chat: near-radius scoping (Section 22 L938)', () => {
  it('only delivers to players inside CHAT_NEAR_RADIUS (150 units)', () => {
    forgetSocketRateLimits('socketA');
    forgetMovementFreshness('socketA');
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    placePlayer(state, spatial, 'playerA', 'socketA', 0);
    placePlayer(state, spatial, 'playerB', 'socketB', 50); // inside radius
    placePlayer(state, spatial, 'playerC', 'socketC', 500); // outside radius

    const { events, sink } = captureOutbound();
    dispatch(state, spatial, 'socketA', {
      type: 'ChatRequest', text: 'hey there', scope: 'near', clientTs: NOW,
    }, sink);

    const directs = events.filter(e => e.type === 'directServerMessage');
    const sockets = directs.map(e => e.type === 'directServerMessage' ? e.socketId : null);
    expect(sockets).toContain('socketB');
    expect(sockets).not.toContain('socketC');
  });
});

describe('chat: all-broadcast (Section 22 L939)', () => {
  it('publishes a single serverMessage that reaches everyone in the room', () => {
    forgetSocketRateLimits('socketA');
    forgetMovementFreshness('socketA');
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    placePlayer(state, spatial, 'playerA', 'socketA', 0);
    placePlayer(state, spatial, 'playerB', 'socketB', 50);
    placePlayer(state, spatial, 'playerC', 'socketC', 500);

    const { events, sink } = captureOutbound();
    dispatch(state, spatial, 'socketA', {
      type: 'ChatRequest', text: 'global hi', scope: 'all', clientTs: NOW,
    }, sink);

    const broadcasts = events.filter(e => e.type === 'serverMessage');
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: 'serverMessage',
      message: { type: 'ChatBroadcast', text: 'global hi', scope: 'all', fromName: 'playerA' },
    });
    // No per-socket directs when scope is 'all' — single broadcast.
    expect(events.filter(e => e.type === 'directServerMessage')).toHaveLength(0);
  });
});

describe('chat: input sanitisation (Section 22 L941/L942)', () => {
  it('rejects empty messages (no broadcast, no directs)', () => {
    forgetSocketRateLimits('socketA');
    forgetMovementFreshness('socketA');
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    placePlayer(state, spatial, 'playerA', 'socketA', 0);
    placePlayer(state, spatial, 'playerB', 'socketB', 50);

    // Schema requires text.min(1), so '' is rejected at parse time and
    // never reaches the router. We test the *post-trim* empty case (a
    // string of only whitespace) which gets through validation.
    const { events, sink } = captureOutbound();
    dispatch(state, spatial, 'socketA', {
      type: 'ChatRequest', text: '   \t\n  ', scope: 'near', clientTs: NOW,
    }, sink);

    expect(events).toEqual([]);
  });

  it('accepts an exact-max (240-char) message without further truncation', () => {
    forgetSocketRateLimits('socketA');
    forgetMovementFreshness('socketA');
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    placePlayer(state, spatial, 'playerA', 'socketA', 0);

    // Protocol cap is 240; the wire schema rejects anything longer at
    // parse time. Exercise the exact-max boundary to verify the
    // handler doesn't trim below.
    const exactMax = 'x'.repeat(240);
    const { events, sink } = captureOutbound();
    dispatch(state, spatial, 'socketA', {
      type: 'ChatRequest', text: exactMax, scope: 'all', clientTs: NOW,
    }, sink);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'serverMessage',
      message: { type: 'ChatBroadcast', text: exactMax },
    });
  });
});

describe('chat: rate limit (Section 22 L943)', () => {
  it('drops chat past the per-socket bucket capacity (6)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      forgetSocketRateLimits('socketA');
      forgetMovementFreshness('socketA');
      const state = createGameState();
      const spatial = new SpatialHashGrid(50);
      placePlayer(state, spatial, 'playerA', 'socketA', 0);

      const { events, sink } = captureOutbound();
      // Chat bucket capacity is 6 (RATE_LIMITS.chat). Burst 7 chats at
      // a fixed system time so no refill happens between requests; the
      // 7th must be dropped. Fake timers keep this deterministic
      // regardless of wall-clock jitter.
      for (let i = 0; i < 7; i++) {
        dispatch(state, spatial, 'socketA', {
          type: 'ChatRequest', text: `m${i}`, scope: 'all', clientTs: NOW + i,
        }, sink);
      }

      const broadcasts = events.filter(e => e.type === 'serverMessage');
      expect(broadcasts).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });
});
