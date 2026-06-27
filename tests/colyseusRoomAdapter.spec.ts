import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createStarterProgressState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { createTransientPlayer } from '../server/playerFactory';
import type { AuthoritativeRoomPort } from '../server/transport/roomBoundary';
import {
  ColyseusAuthoritativeRoomAdapter,
  makeColyseusOutbound,
  type ColyseusClientLike,
} from '../server/transport/colyseusRoomAdapter';
import type { ServerWorldRegion } from '../server/world/regions';

describe('Colyseus room adapter', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

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
  });

  test('scopes entity updates and batched snapshots to each client stream region', () => {
    const state = createGameState();
    const playerA = createTransientPlayer('socket-a', 'A');
    const playerB = createTransientPlayer('socket-b', 'B');
    const enemyA = createEnemy('goblin', 1, { x: 6, y: 0.5, z: 0 }, 1);
    const enemyB = createEnemy('wolf', 1, { x: 306, y: 0.5, z: 0 }, 2);
    playerA.id = 'player-a';
    playerB.id = 'player-b';
    playerA.position = { x: 0, y: 0.5, z: 0 };
    playerB.position = { x: 300, y: 0.5, z: 0 };
    state.players[playerA.id] = playerA;
    state.players[playerB.id] = playerB;
    state.enemies[enemyA.id] = enemyA;
    state.enemies[enemyB.id] = enemyB;
    state.zones.activeZoneIds = ['zone-a', 'zone-b'];
    state.zones.playerZoneIds = { [playerA.id]: 'zone-a', [playerB.id]: 'zone-b' };
    state.zones.enemyZoneIds = { [enemyA.id]: 'zone-a', [enemyB.id]: 'zone-b' };

    const clientA = makeClient('socket-a');
    const clientB = makeClient('socket-b');
    const room = { clients: [clientA, clientB], broadcast: vi.fn() };
    const outbound = makeColyseusOutbound(room, {
      getGameState: () => state,
      getRegions: () => makeRegions(),
    });

    outbound.publish({ type: 'enemyUpdated', update: { id: enemyA.id, health: 72 } });

    expect(clientA.send).toHaveBeenCalledWith('enemyUpdated', { id: enemyA.id, health: 72 });
    expect(clientB.send).not.toHaveBeenCalledWith('enemyUpdated', expect.objectContaining({ id: enemyA.id }));
    expect(room.broadcast).not.toHaveBeenCalledWith('enemyUpdated', expect.anything());

    vi.clearAllMocks();
    outbound.publish({
      type: 'serverMessage',
      message: {
        type: 'BatchUpdate',
        updates: [
          { type: 'PosSnap', id: enemyA.id, pos: { x: 6, z: 0 }, vel: { x: 0, z: 0 }, snapTs: 1 },
          { type: 'PosSnap', id: enemyB.id, pos: { x: 306, z: 0 }, vel: { x: 0, z: 0 }, snapTs: 1 },
        ],
      },
    });

    expect(clientA.send).toHaveBeenCalledWith('msg', {
      type: 'BatchUpdate',
      updates: [expect.objectContaining({ id: enemyA.id })],
    });
    expect(clientB.send).toHaveBeenCalledWith('msg', {
      type: 'BatchUpdate',
      updates: [expect.objectContaining({ id: enemyB.id })],
    });
    expect(runtimeMetrics.snapshot().counters['snapshot.scopedClientUpdates']).toBe(2);
  });
});

describe('Colyseus room adapter join and command handling', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  test('joins a protocol-v2 client through the authoritative room port', async () => {
    const state = { players: {}, enemies: {} } as ReturnType<AuthoritativeRoomPort['getStateSnapshot']>;
    const port = makePort(state);
    const client = makeClient('socket1');
    const adapter = new ColyseusAuthoritativeRoomAdapter(port);
    // PR I: world join now requires a valid session token. Issue one
    // server-side and pass it as the auth handshake.
    const { issueSessionToken } = await import('../server/auth/sessionTokens');
    const token = issueSessionToken('test-account-id');

    await expect(adapter.handleJoin(client, {
      playerName: 'Tester',
      clientProtocolVersion: 2,
      sessionToken: token,
    })).resolves.toEqual({ playerId: 'player1' });

    expect(port.joinClient).toHaveBeenCalledWith('socket1', 'Tester', expect.anything(), expect.objectContaining({ accountId: 'test-account-id' }));
    expect(client.send).not.toHaveBeenCalled();
    expect(runtimeMetrics.snapshot().counters['room.joins']).toBe(1);
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
      serverProtocolVersion: 2,
      minClientProtocolVersion: 2,
    });
    expect(runtimeMetrics.snapshot().counters['room.joinRejected.outdatedProtocol']).toBe(1);
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
    expect(runtimeMetrics.snapshot().counters).toMatchObject({
      'clientMessages.accepted': 1,
      'clientMessages.rejected': 1,
      'clientMessages.type.RequestInventory': 1,
    });
  });
});

describe('Colyseus room adapter guest onboarding', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  test('a tokenless join enters as a Nameless guest (instant-world onboarding)', async () => {
    const port = makePort({ players: {}, enemies: {} } as ReturnType<AuthoritativeRoomPort['getStateSnapshot']>);
    const client = makeClient('socket-guest');
    const adapter = new ColyseusAuthoritativeRoomAdapter(port);

    await expect(adapter.handleJoin(client, {
      playerName: 'Nameless',
      clientProtocolVersion: 2,
    })).resolves.toEqual({ playerId: 'player1' });

    expect(port.joinClient).toHaveBeenCalledWith('socket-guest', 'Nameless', expect.anything(), { guest: true });
    expect(client.send).not.toHaveBeenCalled();
    expect(runtimeMetrics.snapshot().counters['room.joins.guest']).toBe(1);
  });

  test('an invalid/expired token is rejected, not silently downgraded to a guest', async () => {
    const port = makePort({ players: {}, enemies: {} } as ReturnType<AuthoritativeRoomPort['getStateSnapshot']>);
    const client = makeClient('socket-bad');
    const adapter = new ColyseusAuthoritativeRoomAdapter(port);

    await expect(adapter.handleJoin(client, {
      playerName: 'Ghost',
      clientProtocolVersion: 2,
      sessionToken: 'not.a.valid.token',
    })).rejects.toThrow(/invalid or expired session token/);

    expect(port.joinClient).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith('connectionRejected', {
      reason: 'unauthorized',
      message: 'Your session expired — please log in again.',
    });
    expect(runtimeMetrics.snapshot().counters['room.joinRejected.unauthorized']).toBe(1);
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

function makeRegions(): ServerWorldRegion[] {
  return [
    makeRegion('zone-a', 0),
    makeRegion('zone-b', 300),
  ];
}

function makeRegion(id: string, x: number): ServerWorldRegion {
  return {
    id,
    zoneId: id,
    name: id,
    center: { x, y: 0, z: 0 },
    radius: 50,
    active: true,
    maxEnemies: 4,
  };
}
