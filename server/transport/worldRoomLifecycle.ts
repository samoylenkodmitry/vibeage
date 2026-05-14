import type { GameState } from '../gameState.js';
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
  const result = await adapter.handleJoin(client, parseWorldRoomJoinOptions(options));
  const player = world.getGameState().players[result.playerId];

  if (player) {
    room.broadcast(SOCKET_SESSION_EVENTS.playerJoined, sanitizePlayerForPublic(player), { except: client });
  }

  sendWorldRoomClientSnapshot(world, client);
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
