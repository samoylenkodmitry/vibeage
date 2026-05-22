import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * ROADMAP L689 — disconnect-persists-player test.
 *
 * When a socket leaves the world (graceful logout, drop, kick), the
 * server must call `persistPlayer()` before deleting the player from
 * the in-memory state. Otherwise progression earned in the last few
 * tick budgets between persistence sweeps would be lost across the
 * disconnect.
 *
 * Mocking strategy: stub `../server/persistence` at the module
 * boundary so we can observe `persistPlayer` and `recordServerEvent`
 * call counts and arguments without standing up a real DB.
 *
 * The persistence-disabled branch (`VIBEAGE_DISABLE_PERSISTENCE=1`)
 * still routes through the same helpers but they return early; this
 * test asserts the SHAPE of the disconnect path, which is the
 * production-mode contract.
 */

const persistenceMock = vi.hoisted(() => ({
  persistPlayer: vi.fn(async () => undefined),
  recordServerEvent: vi.fn(async () => undefined),
  isPersistenceDisabled: vi.fn(() => false),
  upsertPlayerSession: vi.fn(async () => ({ id: 'pid-1' })),
}));

vi.mock('../server/persistence', () => persistenceMock);

const { createGameState } = await import('../server/gameState');
const { SpatialHashGrid } = await import('../server/spatial/SpatialHashGrid');
const { createTransientPlayer } = await import('../server/playerFactory');
const { upsertActivePlayerSession, removePlayerSessionBySocketId } = await import(
  '../server/players/playerSession'
);

describe('removePlayerSessionBySocketId — disconnect persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calls persistPlayer with the leaving player before deleting them from state', async () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('socket-1', 'DiscoTester');
    player.level = 7;
    player.experience = 420;
    upsertActivePlayerSession(state, spatial, player);

    const removed = await removePlayerSessionBySocketId(state, spatial, 'socket-1');

    expect(removed).toBe(player.id);
    // persistPlayer must have been called exactly once with the
    // *full* player object — not a stripped projection — so the
    // persistence layer sees the latest progression.
    expect(persistenceMock.persistPlayer).toHaveBeenCalledTimes(1);
    const argv = persistenceMock.persistPlayer.mock.calls[0][0] as { id: string; level: number };
    expect(argv.id).toBe(player.id);
    expect(argv.level).toBe(7);
    // …and the player IS gone from state afterward.
    expect(state.players[player.id]).toBeUndefined();
  });

  test('records a player_disconnect event with the player id', async () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('socket-2', 'EventTester');
    upsertActivePlayerSession(state, spatial, player);

    await removePlayerSessionBySocketId(state, spatial, 'socket-2');

    expect(persistenceMock.recordServerEvent).toHaveBeenCalledTimes(1);
    const [eventType, playerId] = persistenceMock.recordServerEvent.mock.calls[0];
    expect(eventType).toBe('player_disconnect');
    expect(playerId).toBe(player.id);
  });

  test('a persistPlayer rejection does not block player removal (crash-recovery property)', async () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('socket-3', 'BoomTester');
    upsertActivePlayerSession(state, spatial, player);
    persistenceMock.persistPlayer.mockRejectedValueOnce(new Error('db down'));

    // Should not throw, and the player should still leave the world
    // — otherwise a transient DB outage would pile up zombie players
    // in memory until the process is restarted.
    await expect(
      removePlayerSessionBySocketId(state, spatial, 'socket-3'),
    ).resolves.toBe(player.id);
    expect(state.players[player.id]).toBeUndefined();
  });

  test('disconnect from an unknown socket is a no-op (no persist, no event)', async () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();

    const removed = await removePlayerSessionBySocketId(state, spatial, 'ghost-socket');

    expect(removed).toBeNull();
    expect(persistenceMock.persistPlayer).not.toHaveBeenCalled();
    expect(persistenceMock.recordServerEvent).not.toHaveBeenCalled();
  });
});
