import { describe, expect, test, vi } from 'vitest';
import { createStarterProgressState } from '../packages/protocol/messages';
import type { PlayerState } from '../shared/types';
import type { AuthoritativeRoomPort } from '../server/transport/roomBoundary';
import {
  ColyseusAuthoritativeRoomAdapter,
  makeColyseusOutbound,
  type ColyseusClientLike,
} from '../server/transport/colyseusRoomAdapter';

describe('Colyseus room adapter', () => {
  test('maps room broadcasts onto the current outbound event contract', () => {
    const directClient = makeClient('socket1');
    const room = {
      clients: [directClient],
      broadcast: vi.fn(),
    };
    const outbound = makeColyseusOutbound(room);

    outbound.publish({
      type: 'serverMessage',
      message: { type: 'LootPickup', lootId: 'loot1', playerId: 'player1' },
    });
    outbound.publish({
      type: 'directServerMessage',
      socketId: 'socket1',
      message: { type: 'LootAcquired', items: [{ itemId: 'gold_coin', quantity: 1 }] },
    });
    outbound.publish({
      type: 'playerUpdated',
      update: {
        id: 'player1',
        health: 80,
        starterProgress: createStarterProgressState({ defeatedEnemies: 1 }),
      },
    });
    outbound.publish({
      type: 'playerJoined',
      player: {
        id: 'player1',
        socketId: 'socket1',
        name: 'Tester',
        starterProgress: createStarterProgressState({ defeatedEnemies: 1 }),
      } as PlayerState,
    });

    expect(room.broadcast).toHaveBeenCalledWith('msg', {
      type: 'LootPickup',
      lootId: 'loot1',
      playerId: 'player1',
    });
    expect(directClient.send).toHaveBeenCalledWith('msg', {
      type: 'LootAcquired',
      items: [{ itemId: 'gold_coin', quantity: 1 }],
    });
    expect(room.broadcast).toHaveBeenCalledWith('playerUpdated', { id: 'player1', health: 80 });
    expect(room.broadcast).toHaveBeenCalledWith('playerJoined', {
      id: 'player1',
      name: 'Tester',
    });
  });
});

describe('Colyseus room adapter join and command handling', () => {
  test('joins a protocol-v2 client through the authoritative room port', async () => {
    const state = { players: {}, enemies: {} } as ReturnType<AuthoritativeRoomPort['getStateSnapshot']>;
    const port = makePort(state);
    const client = makeClient('socket1');
    const adapter = new ColyseusAuthoritativeRoomAdapter(port);

    await expect(adapter.handleJoin(client, {
      playerName: 'Tester',
      clientProtocolVersion: 2,
    })).resolves.toEqual({ playerId: 'player1' });

    expect(port.joinClient).toHaveBeenCalledWith('socket1', 'Tester', expect.anything());
    expect(client.send).toHaveBeenCalledWith('joinGame', { playerId: 'player1' });
    expect(client.send).toHaveBeenCalledWith('gameState', state);
  });

  test('rejects outdated protocol clients before they enter the room port', async () => {
    const port = makePort({ players: {}, enemies: {} } as ReturnType<AuthoritativeRoomPort['getStateSnapshot']>);
    const client = makeClient('socket1');
    const adapter = new ColyseusAuthoritativeRoomAdapter(port);

    await expect(adapter.handleJoin(client, {
      playerName: 'Tester',
      clientProtocolVersion: 1,
    })).rejects.toThrow('outdated protocol');

    expect(port.joinClient).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith('connectionRejected', {
      reason: 'outdatedProtocol',
      message: 'This server requires protocol v2 or higher.',
    });
  });

  test('dispatches validated client commands through the room port', () => {
    const port = makePort({ players: {}, enemies: {} } as ReturnType<AuthoritativeRoomPort['getStateSnapshot']>);
    const client = makeClient('socket1');
    const adapter = new ColyseusAuthoritativeRoomAdapter(port);

    expect(adapter.handleMessage(client, {
      type: 'RequestInventory',
    })).toBe(true);
    expect(adapter.handleMessage(client, {
      type: 'UnknownMessage',
    })).toBe(false);

    expect(port.dispatchCommand).toHaveBeenCalledWith('socket1', { type: 'RequestInventory' }, expect.anything());
    expect(port.dispatchCommand).toHaveBeenCalledTimes(1);
  });
});

function makeClient(sessionId: string): ColyseusClientLike & { send: ReturnType<typeof vi.fn> } {
  return {
    sessionId,
    send: vi.fn(),
  };
}

function makePort(state: ReturnType<AuthoritativeRoomPort['getStateSnapshot']>): AuthoritativeRoomPort {
  return {
    joinClient: vi.fn(async () => ({ playerId: 'player1' })),
    leaveClient: vi.fn(async () => 'player1'),
    dispatchCommand: vi.fn(),
    getStateSnapshot: vi.fn(() => state),
  };
}
