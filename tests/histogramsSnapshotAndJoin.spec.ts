import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { SESSION_EVENTS } from '../packages/protocol/sessionEvents';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  makeClientDirectSink,
  sendClientInitialSnapshot,
  type SnapshotClient,
} from '../server/transport/clientSnapshot';
import { joinWorldRoomClient } from '../server/transport/worldRoomLifecycle';

/**
 * §52 #4 — additional histograms (post-`snapshot.batchSize`):
 *
 *   - `snapshot.bytes`        — JSON-serialized initial snapshot size
 *   - `snapshot.playerCount`  — visible-player count at snapshot time
 *   - `snapshot.enemyCount`   — visible-enemy count at snapshot time
 *   - `db.upsertSession.durationMs` — join-flow DB latency (covered
 *     indirectly in this file via the join wrapper; the repo unit test
 *     adds it directly when the persistence adapter runs)
 *   - `db.updatePlayer.durationMs` — same shape; covered by the
 *     persistence test where a real DB write actually happens
 *   - `world.joinDurationMs`  — end-to-end join wall time
 */

function makeClient(sessionId: string): SnapshotClient & { send: ReturnType<typeof vi.fn> } {
  return { sessionId, send: vi.fn() };
}

describe('§52 #4 — snapshot.* histograms', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  afterEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('records snapshot.bytes / playerCount / enemyCount on initial-snapshot send', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket1', 'Tester');
    player.id = 'player1';
    state.players[player.id] = player;
    const client = makeClient('socket1');

    sendClientInitialSnapshot(client, state, makeClientDirectSink(client));

    const histograms = runtimeMetrics.snapshot().histograms;
    expect(histograms['snapshot.bytes']?.samples).toBe(1);
    expect(histograms['snapshot.bytes']?.p50).toBeGreaterThan(0);
    expect(histograms['snapshot.playerCount']?.samples).toBe(1);
    expect(histograms['snapshot.playerCount']?.p50).toBe(1);
    expect(histograms['snapshot.enemyCount']?.samples).toBe(1);
    expect(histograms['snapshot.enemyCount']?.p50).toBe(0);
  });

  it('snapshot.bytes scales up roughly with player count (regression net for snapshot bloat)', () => {
    const state = createGameState();
    for (let i = 0; i < 5; i += 1) {
      const player = createTransientPlayer(`socket${i}`, `Tester${i}`);
      player.id = `p${i}`;
      state.players[player.id] = player;
    }
    const client = makeClient('socket0');
    sendClientInitialSnapshot(client, state, makeClientDirectSink(client));
    const histograms = runtimeMetrics.snapshot().histograms;
    expect(histograms['snapshot.playerCount']?.p50).toBe(5);
    expect(histograms['snapshot.bytes']?.p50).toBeGreaterThan(500);
  });
});

describe('§52 #4 — world.joinDurationMs histogram', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });
  afterEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('records one join-duration sample per joinWorldRoomClient call', async () => {
    const state = createGameState();
    const player = createTransientPlayer('s-join', 'Joiner');
    player.id = 'joiner';
    state.players[player.id] = player;
    const client = makeClient('s-join');
    const adapter = {
      handleJoin: vi.fn().mockResolvedValue({ playerId: 'joiner' }),
      handleLeave: vi.fn(),
    };
    const room = { clients: [], broadcast: vi.fn() };
    const world = { getGameState: () => state };

    await joinWorldRoomClient(room, adapter, world, client, {});

    const histograms = runtimeMetrics.snapshot().histograms;
    expect(histograms['world.joinDurationMs']?.samples).toBe(1);
    expect(histograms['world.joinDurationMs']?.p50).toBeGreaterThanOrEqual(0);
    // Sanity: client got the gameState event from the snapshot path.
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.gameState, expect.anything());
  });

  it('records the join sample even when the adapter rejects (so latency stays measurable on errors)', async () => {
    const client = makeClient('s-rej');
    const adapter = {
      handleJoin: vi.fn().mockRejectedValue(new Error('boom')),
      handleLeave: vi.fn(),
    };
    const room = { clients: [], broadcast: vi.fn() };
    const world = { getGameState: () => createGameState() };

    await expect(joinWorldRoomClient(room, adapter, world, client, {})).rejects.toThrow('boom');

    const histograms = runtimeMetrics.snapshot().histograms;
    expect(histograms['world.joinDurationMs']?.samples).toBe(1);
  });
});
