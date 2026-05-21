import { performance } from 'node:perf_hooks';
import type { GameState } from '../gameState.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import type { ServerWorldRegion } from '../world/regions.js';
import { sanitizePlayerForPublic } from './clientState.js';
import { makeClientDirectSink, sendClientInitialSnapshot, type SnapshotClient } from './clientSnapshot.js';
import { parseWorldRoomJoinOptions, SOCKET_SESSION_EVENTS, type WorldRoomJoinOptions } from './roomBoundary.js';

export type WorldRoomAdapter = {
  handleJoin(client: SnapshotClient, options: WorldRoomJoinOptions): Promise<{ playerId: string }>;
  handleLeave(client: SnapshotClient): Promise<string | undefined>;
};

export type WorldRoomStateSource = {
  getGameState(): GameState;
  getRegions?(): readonly ServerWorldRegion[];
};

export type WorldRoomBroadcaster<ClientType extends SnapshotClient = SnapshotClient> = {
  broadcast(event: string, payload: unknown, options?: { except?: ClientType }): unknown;
};

export async function joinWorldRoomClient<ClientType extends SnapshotClient>(
  room: WorldRoomBroadcaster<ClientType>,
  adapter: WorldRoomAdapter,
  world: WorldRoomStateSource,
  client: ClientType,
  options?: unknown,
): Promise<void> {
  // §52 #4 — end-to-end join latency: from the moment the room
  // hands the client off to us, through the adapter (which does the
  // DB upsert), through the public broadcast, through the initial
  // snapshot send. The DB step has its own histogram so the two
  // metrics together let #12 isolate where time is going.
  const startedAt = performance.now();
  try {
    const result = await adapter.handleJoin(client, parseWorldRoomJoinOptions(options));
    const player = world.getGameState().players[result.playerId];

    if (player) {
      room.broadcast(SOCKET_SESSION_EVENTS.playerJoined, sanitizePlayerForPublic(player), { except: client });
    }

    sendWorldRoomClientSnapshot(world, client);
  } finally {
    runtimeMetrics.recordHistogram('world.joinDurationMs', performance.now() - startedAt);
  }
}

export async function leaveWorldRoomClient<ClientType extends SnapshotClient>(
  room: WorldRoomBroadcaster<ClientType>,
  adapter: WorldRoomAdapter,
  client: ClientType,
): Promise<void> {
  const playerId = await adapter.handleLeave(client);
  if (playerId) {
    room.broadcast(SOCKET_SESSION_EVENTS.playerLeft, playerId);
  }
}

export function sendWorldRoomClientSnapshot(
  world: WorldRoomStateSource,
  client: SnapshotClient,
): void {
  sendClientInitialSnapshot(client, world.getGameState(), makeClientDirectSink(client), world.getRegions?.());
}
