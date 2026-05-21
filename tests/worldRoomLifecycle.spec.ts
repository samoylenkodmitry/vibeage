import { describe, expect, test, vi } from 'vitest';
import { SESSION_EVENTS } from '../packages/protocol/sessionEvents';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import {
  joinWorldRoomClient,
  leaveWorldRoomClient,
  sendWorldRoomClientSnapshot,
  type WorldRoomAdapter,
  type WorldRoomBroadcaster,
} from '../server/transport/worldRoomLifecycle';

describe('world room lifecycle boundary', () => {
  test('joins through the adapter, broadcasts public player state, and sends the owner snapshot', async () => {
    const state = createGameState();
    const player = createTransientPlayer('socket1', 'Tester');
    player.id = 'player1';
    state.players[player.id] = player;
    const world = { getGameState: vi.fn(() => state) };
    const adapter = makeAdapter({ joinResult: { playerId: player.id } });
    const room = makeRoom();
    const client = makeClient('socket1');

    await joinWorldRoomClient(room, adapter, world, client, {
      playerName: 'Tester',
      clientProtocolVersion: 2,
    });

    expect(adapter.handleJoin).toHaveBeenCalledWith(client, {
      playerName: 'Tester',
      clientProtocolVersion: 2,
    });
    expect(room.broadcast).toHaveBeenCalledWith(
      SESSION_EVENTS.playerJoined,
      expect.not.objectContaining({ socketId: 'socket1' }),
      { except: client },
    );
    expect(client.send).toHaveBeenCalledWith(
      SESSION_EVENTS.joinGame,
      expect.objectContaining({ playerId: player.id, serverProtocolVersion: expect.any(Number) }),
    );
    // §52 #3 — the owner snapshot is now an `OwnerPlayerSnapshot`
    // projection. `socketId` is server-only bookkeeping; the client
    // already knows its session id, so it's not in the allowlist.
    // Pin a field the owner snapshot *does* carry instead.
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.gameState, expect.objectContaining({
      players: expect.objectContaining({ player1: expect.objectContaining({ id: 'player1', name: player.name }) }),
    }));
    const gameStateCall = client.send.mock.calls.find((c) => c[0] === SESSION_EVENTS.gameState);
    expect(gameStateCall?.[1]).toBeDefined();
    const ownPlayer = (gameStateCall![1] as { players: Record<string, Record<string, unknown>> }).players.player1;
    expect(ownPlayer).not.toHaveProperty('socketId');
    expect(ownPlayer).not.toHaveProperty('characterInventory');
  });

  test('leaves through the adapter and broadcasts only when a player was active', async () => {
    const room = makeRoom();
    const adapter = makeAdapter({ leaveResult: 'player1' });
    const client = makeClient('socket1');

    await leaveWorldRoomClient(room, adapter, client);

    expect(adapter.handleLeave).toHaveBeenCalledWith(client);
    expect(room.broadcast).toHaveBeenCalledWith(SESSION_EVENTS.playerLeft, 'player1');
  });

  test('can resend the current client snapshot without rejoining', () => {
    const state = createGameState();
    const world = { getGameState: vi.fn(() => state) };
    const client = makeClient('socket1');

    sendWorldRoomClientSnapshot(world, client);

    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.gameState, expect.objectContaining({ players: {} }));
  });
});

function makeAdapter({
  joinResult = { playerId: 'player1' },
  leaveResult,
}: {
  joinResult?: { playerId: string };
  leaveResult?: string;
} = {}): WorldRoomAdapter {
  return {
    handleJoin: vi.fn(async () => joinResult),
    handleLeave: vi.fn(async () => leaveResult),
  };
}

function makeRoom(): WorldRoomBroadcaster & { broadcast: ReturnType<typeof vi.fn> } {
  return { broadcast: vi.fn() };
}

function makeClient(sessionId: string) {
  return {
    sessionId,
    send: vi.fn(),
  };
}
