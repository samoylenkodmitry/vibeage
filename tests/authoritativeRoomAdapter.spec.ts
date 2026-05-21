import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createSocketBackedAuthoritativeRoom } from '../server/transport/authoritativeRoomAdapter';
import type { SocketBackedWorldApi } from '../server/transport/authoritativeRoomAdapter';
import type { AuthoritativeRoomSocket } from '../server/transport/roomBoundary';

describe('socket-backed authoritative room adapter', () => {
  test('joins and leaves clients through the current world API', async () => {
    const state = createGameState();
    const world = makeWorldApi(state);
    const room = createSocketBackedAuthoritativeRoom(world);

    await expect(room.joinClient('socket1', 'Tester')).resolves.toEqual({
      playerId: 'player1',
    });
    await expect(room.leaveClient('socket1')).resolves.toBe('player1');

    expect(world.addPlayer).toHaveBeenCalledWith('socket1', 'Tester', undefined);
    expect(world.removePlayerBySocketId).toHaveBeenCalledWith('socket1');
  });

  test('dispatches validated commands with a socket-shaped client identity', () => {
    const state = createGameState();
    const world = makeWorldApi(state);
    const room = createSocketBackedAuthoritativeRoom(world);

    room.dispatchCommand('socket1', {
      type: 'MoveIntent',
      id: 'player1',
      targetPos: { x: 5, z: 6 },
      clientTs: 100,
    });

    expect(world.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'socket1' }),
      expect.objectContaining({ type: 'MoveIntent' }),
    );
  });

  test('reuses the joined client target for direct command replies', async () => {
    const state = createGameState();
    const world = makeWorldApi(state);
    const room = createSocketBackedAuthoritativeRoom(world);
    const client = { emit: vi.fn() };

    await room.joinClient('socket1', 'Tester', client);
    room.dispatchCommand('socket1', { type: 'RequestInventory' });

    expect(client.emit).toHaveBeenCalledWith('msg', {
      type: 'InventoryUpdate',
      maxInventorySlots: 20,
    });
  });

  test('returns the current state snapshot without cloning runtime state', () => {
    const state = createGameState();
    const room = createSocketBackedAuthoritativeRoom(makeWorldApi(state));

    expect(room.getStateSnapshot()).toBe(state);
  });
});

function makeWorldApi(state: ReturnType<typeof createGameState>): SocketBackedWorldApi {
  return {
    handleMessage: vi.fn((socket: AuthoritativeRoomSocket) => {
      socket.emit('msg', {
        type: 'InventoryUpdate',
        maxInventorySlots: 20,
      });
    }),
    getGameState: vi.fn(() => state),
    addPlayer: vi.fn(async (socketId: string, name: string) => ({
      id: 'player1',
      socketId,
      name,
    }) as ReturnType<typeof createGameState>['players'][string]),
    removePlayerBySocketId: vi.fn(async () => 'player1'),
  };
}
