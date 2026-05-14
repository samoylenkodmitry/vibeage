import { describe, expect, test, vi } from 'vitest';
import { SESSION_EVENTS } from '../packages/protocol/sessionEvents';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  makeClientDirectSink,
  sendClientInitialSnapshot,
  type SnapshotClient,
} from '../server/transport/clientSnapshot';

describe('client initial snapshot transport', () => {
  test('sends owner identity, owner-only direct state, and public game state from one path', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket1', 'Tester');
    player.id = 'player1';
    player.inventory = [{ itemId: 'health_potion', quantity: 2 }];
    state.players[player.id] = player;

    const client = makeClient('socket1');
    sendClientInitialSnapshot(client, state, makeClientDirectSink(client));

    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.joinGame, { playerId: 'player1' });
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.message, {
      type: 'InventoryUpdate',
      playerId: 'player1',
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      maxInventorySlots: 20,
    });
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.message, {
      type: 'StarterProgressUpdate',
      progress: player.starterProgress,
      rewardGranted: false,
    });
    expect(client.send).toHaveBeenCalledWith(
      SESSION_EVENTS.gameState,
      expect.objectContaining({
        players: expect.objectContaining({
          player1: expect.objectContaining({ socketId: 'socket1' }),
        }),
      }),
    );
  });

  test('does not emit join-only direct messages when no player is attached to the session', () => {
    const state = createGameState();
    const client = makeClient('unknown-socket');

    sendClientInitialSnapshot(client, state, makeClientDirectSink(client));

    expect(client.send).not.toHaveBeenCalledWith(SESSION_EVENTS.joinGame, expect.anything());
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.gameState, expect.objectContaining({ players: {} }));
  });
});

function makeClient(sessionId: string): SnapshotClient & { send: ReturnType<typeof vi.fn> } {
  return {
    sessionId,
    send: vi.fn(),
  };
}
