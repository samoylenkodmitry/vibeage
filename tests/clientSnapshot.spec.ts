import { describe, expect, test, vi } from 'vitest';
import { SESSION_EVENTS } from '../packages/protocol/sessionEvents';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import {
  makeClientDirectSink,
  sendClientInitialSnapshot,
  type SnapshotClient,
} from '../server/transport/clientSnapshot';
import { makeClientGameStateSnapshot } from '../server/transport/clientState';

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

  test('initial game state includes enemies from global active zones only', () => {
    const state = createGameState();
    const activeEnemy = createEnemy('goblin', 1, { x: 1, y: 0.5, z: 1 }, 1);
    const inactiveEnemy = createEnemy('wolf', 1, { x: 200, y: 0.5, z: 1 }, 2);
    state.enemies[activeEnemy.id] = activeEnemy;
    state.enemies[inactiveEnemy.id] = inactiveEnemy;
    state.zones.activeZoneIds = ['starter_meadow'];
    state.zones.enemyZoneIds[activeEnemy.id] = 'starter_meadow';
    state.zones.enemyZoneIds[inactiveEnemy.id] = 'future_zone';

    const snapshot = makeClientGameStateSnapshot(state, 'socket1');

    expect(Object.keys(snapshot.enemies)).toEqual([activeEnemy.id]);
  });
});

function makeClient(sessionId: string): SnapshotClient & { send: ReturnType<typeof vi.fn> } {
  return {
    sessionId,
    send: vi.fn(),
  };
}
