import { describe, expect, test, vi } from 'vitest';
import { SESSION_EVENTS } from '../packages/protocol/sessionEvents';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import {
  makeClientDirectSink,
  sendClientInitialSnapshot,
  type SnapshotClient,
} from '../server/transport/clientSnapshot';
import { makeClientGameStateSnapshot } from '../server/transport/clientState';
import type { ServerWorldRegion } from '../server/world/regions';

describe('client initial snapshot transport', () => {
  test('sends owner identity, owner-only direct state, and public game state from one path', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket1', 'Tester');
    player.id = 'player1';
    // §52 #2 — characterInventory is the sole source of truth.
    player.characterInventory = createEmptyInventory(player.id, player.characterInventory!.limits);
    addItemsToPlayer(player, 'health_potion', 2);
    state.players[player.id] = player;

    const client = makeClient('socket1');
    sendClientInitialSnapshot(client, state, makeClientDirectSink(client));

    expect(client.send).toHaveBeenCalledWith(
      SESSION_EVENTS.joinGame,
      expect.objectContaining({ playerId: 'player1', serverProtocolVersion: expect.any(Number) }),
    );
    // §52 #11 — wire shape now carries `slotIndex` + `instanceId`.
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.message, expect.objectContaining({
      type: 'InventoryUpdate',
      playerId: 'player1',
      maxInventorySlots: 20,
      inventory: [expect.objectContaining({
        itemId: 'health_potion', quantity: 2, slotIndex: 0,
      })],
    }));
    expect(client.send).toHaveBeenCalledWith(SESSION_EVENTS.message, {
      type: 'StarterProgressUpdate',
      progress: player.starterProgress,
      rewardGranted: false,
    });
    // §52 #3 — owner snapshot is now an OwnerPlayerSnapshot projection.
    // socketId stays server-only; pin a field the allowlist surfaces.
    expect(client.send).toHaveBeenCalledWith(
      SESSION_EVENTS.gameState,
      expect.objectContaining({
        players: expect.objectContaining({
          player1: expect.objectContaining({ id: 'player1', name: player.name }),
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

  test('region-scoped snapshots include only entities and loot in the client stream', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket1', 'Tester');
    const otherPlayer = createTransientPlayer('socket2', 'Other');
    const localEnemy = createEnemy('goblin', 1, { x: 6, y: 0.5, z: 0 }, 3);
    const farEnemy = createEnemy('wolf', 1, { x: 306, y: 0.5, z: 0 }, 4);
    player.id = 'player1';
    otherPlayer.id = 'player2';
    player.position = { x: 0, y: 0.5, z: 0 };
    otherPlayer.position = { x: 300, y: 0.5, z: 0 };

    state.players[player.id] = player;
    state.players[otherPlayer.id] = otherPlayer;
    state.enemies[localEnemy.id] = localEnemy;
    state.enemies[farEnemy.id] = farEnemy;
    state.groundLoot.local = { position: { x: 4, z: 0 }, items: [{ itemId: 'gold_coin', quantity: 1 }] };
    state.groundLoot.far = { position: { x: 304, z: 0 }, items: [{ itemId: 'gold_coin', quantity: 1 }] };
    state.zones.activeZoneIds = ['zone-a', 'zone-b'];
    state.zones.playerZoneIds = { player1: 'zone-a', player2: 'zone-b' };
    state.zones.enemyZoneIds = { [localEnemy.id]: 'zone-a', [farEnemy.id]: 'zone-b' };

    const snapshot = makeClientGameStateSnapshot(state, 'socket1', makeRegions());

    expect(Object.keys(snapshot.players)).toEqual(['player1']);
    expect(Object.keys(snapshot.enemies)).toEqual([localEnemy.id]);
    expect(Object.keys(snapshot.groundLoot)).toEqual(['local']);
    expect(snapshot.zones.enemyZoneIds).toEqual({ [localEnemy.id]: 'zone-a' });
  });
});

function makeClient(sessionId: string): SnapshotClient & { send: ReturnType<typeof vi.fn> } {
  return {
    sessionId,
    send: vi.fn(),
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
