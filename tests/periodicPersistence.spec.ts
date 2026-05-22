import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * ROADMAP L690 — periodic persistence tests.
 *
 * `persistActivePlayers(state)` is invoked by `startPersistenceLoop`
 * (in `server/world.ts`) on a setInterval cadence. The pinned
 * contract:
 *
 *  - it iterates every active player and calls `persistPlayer` for each
 *  - it uses Promise.allSettled (a single rejected persist doesn't
 *    cancel the others)
 *  - it logs rejected results so a transient DB outage doesn't
 *    silently lose state for SOME players while quietly succeeding
 *    for others
 *
 * Mocks `../server/persistence` at the module boundary so the test
 * observes call counts without standing up a DB.
 */

const persistenceMock = vi.hoisted(() => ({
  persistPlayer: vi.fn(),
  recordServerEvent: vi.fn(),
  isPersistenceDisabled: vi.fn(() => false),
  upsertPlayerSession: vi.fn(),
}));
vi.mock('../server/persistence', () => persistenceMock);

const { createGameState } = await import('../server/gameState');
const { createTransientPlayer } = await import('../server/playerFactory');
const { persistActivePlayers } = await import('../server/players/playerSession');

describe('persistActivePlayers — periodic persistence sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calls persistPlayer for every active player exactly once', async () => {
    const state = createGameState();
    const playerA = createTransientPlayer('socket-a', 'Alice');
    const playerB = createTransientPlayer('socket-b', 'Bob');
    const playerC = createTransientPlayer('socket-c', 'Carol');
    state.players[playerA.id] = playerA;
    state.players[playerB.id] = playerB;
    state.players[playerC.id] = playerC;

    await persistActivePlayers(state);

    expect(persistenceMock.persistPlayer).toHaveBeenCalledTimes(3);
    const persistedIds = persistenceMock.persistPlayer.mock.calls
      .map((call) => (call[0] as { id: string }).id)
      .sort();
    expect(persistedIds).toEqual([playerA.id, playerB.id, playerC.id].sort());
  });

  test('a single rejected persist does NOT cancel the rest (Promise.allSettled semantics)', async () => {
    const state = createGameState();
    const playerA = createTransientPlayer('socket-a', 'Alice');
    const playerB = createTransientPlayer('socket-b', 'Bob');
    state.players[playerA.id] = playerA;
    state.players[playerB.id] = playerB;
    // First call rejects, second still has to be made.
    persistenceMock.persistPlayer
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce(undefined);

    // Must not throw — the caller (setInterval loop) treats persistActivePlayers
    // as a no-throw boundary so the loop survives a single bad tick.
    await expect(persistActivePlayers(state)).resolves.toBeUndefined();
    expect(persistenceMock.persistPlayer).toHaveBeenCalledTimes(2);
  });

  test('empty player set is a clean no-op', async () => {
    const state = createGameState();
    await persistActivePlayers(state);
    expect(persistenceMock.persistPlayer).not.toHaveBeenCalled();
  });

  test('persists the full PlayerState (not a stripped projection)', async () => {
    const state = createGameState();
    const player = createTransientPlayer('socket-a', 'Persisty');
    player.level = 9;
    player.experience = 1234;
    state.players[player.id] = player;

    await persistActivePlayers(state);

    const persisted = persistenceMock.persistPlayer.mock.calls[0][0] as
      { id: string; level: number; experience: number };
    expect(persisted.id).toBe(player.id);
    expect(persisted.level).toBe(9);
    expect(persisted.experience).toBe(1234);
  });
});
