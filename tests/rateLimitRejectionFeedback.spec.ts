import { describe, expect, it, beforeEach } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { upsertActivePlayerSession } from '../server/players/playerSession';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { forgetSocketRateLimits } from '../server/world/rateLimiter';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §52 polish — rate-limit drops on user-intent commands surface a
 * `CommandRejected{reason:'rateLimited'}` envelope so the client UI
 * can show "slow down" feedback. Movement / cast intents are
 * explicitly excluded — they're high-frequency client-initiated, so
 * a rate-limit drop is normal and shouldn't spam the combat log.
 */

function setupChatPlayer() {
  const state = createGameState();
  const player = createTransientPlayer('s-rl', 'rl-tester');
  upsertActivePlayerSession(state, new SpatialHashGrid(), player);
  return { state, player };
}

function captureSentDirect() {
  const sent: ServerMessage[] = [];
  return {
    sent,
    socket: (sessionId: string) => ({
      id: sessionId,
      emit: (_event: string, msg: ServerMessage) => { sent.push(msg); },
    }),
  };
}

describe('rate-limit drop → CommandRejected (§52 polish)', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    forgetSocketRateLimits('s-rl');
  });

  it('ChatRequest emits CommandRejected{rateLimited} after the bucket drains', () => {
    const { state, player } = setupChatPlayer();
    const { sent, socket } = captureSentDirect();
    const client = socket(player.socketId!);
    // Chat bucket: capacity 6, refill 1/sec. Send 7 messages back-to-back;
    // the 7th should drop.
    for (let i = 0; i < 7; i += 1) {
      handleClientMessage(
        client,
        state,
        { type: 'ChatRequest', text: `msg ${i}`, scope: 'near', clientTs: i, clientSeq: 100 + i },
        { publish: () => undefined },
        new SpatialHashGrid(),
      );
    }
    const rejections = sent.filter((m) => m.type === 'CommandRejected'
      && (m as { commandType?: string }).commandType === 'ChatRequest');
    const rateLimited = rejections.filter((m) => (m as { reason?: string }).reason === 'rateLimited');
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    // Sanity: the rate-limit counter incremented too.
    expect(runtimeMetrics.snapshot().counters['rateLimit.dropped.ChatRequest']).toBeGreaterThanOrEqual(1);
  });

  it('MoveIntent rate-limit drops stay silent (no CommandRejected emitted)', () => {
    const { state, player } = setupChatPlayer();
    const { sent, socket } = captureSentDirect();
    const client = socket(player.socketId!);
    // Movement bucket: capacity 25, refill 25/sec. Spam 60 to overflow.
    for (let i = 0; i < 60; i += 1) {
      handleClientMessage(
        client,
        state,
        { type: 'MoveIntent', id: player.id, targetPos: { x: i, z: 0 }, clientTs: i },
        { publish: () => undefined },
        new SpatialHashGrid(),
      );
    }
    const rejections = sent.filter((m) => m.type === 'CommandRejected'
      && (m as { commandType?: string }).commandType === 'MoveIntent');
    expect(rejections).toEqual([]);
    // The counter still increments — only the user-facing envelope is skipped.
    expect(runtimeMetrics.snapshot().counters['rateLimit.dropped.MoveIntent']).toBeGreaterThanOrEqual(1);
  });
});
