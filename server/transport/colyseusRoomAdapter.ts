import {
  describeProtocolError,
  safeParseClientMessage,
  type ServerMessage,
  type ClientMessage,
} from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import type {
  AuthoritativeRoomClient,
  AuthoritativeRoomPort,
  WorldRoomJoinOptions,
} from './roomBoundary.js';
import { MIN_CLIENT_PROTOCOL_VERSION, SOCKET_SESSION_EVENTS } from './roomBoundary.js';
import type { OutboundEvent, OutboundEventSink } from './outboundEvents.js';
import { WORLD_BROADCAST_EVENTS } from './outboundEvents.js';
import {
  sanitizePlayerUpdateForPublic,
} from './clientState.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import {
  getEntityRegionId,
  getPositionRegionId,
  isEntityVisibleToSocket,
  isRegionVisibleToSocket,
  type ServerWorldRegion,
} from '../world/regions.js';

export type ColyseusClientLike = {
  sessionId: string;
  send(type: string, message?: unknown): unknown;
};

export type ColyseusBroadcastLike = {
  clients?: Iterable<ColyseusClientLike>;
  broadcast(type: string, message?: unknown): unknown;
};

export type ColyseusVisibilitySource = {
  getGameState(): GameState | undefined;
  getRegions(): readonly ServerWorldRegion[] | undefined;
};

export class ColyseusAuthoritativeRoomAdapter {
  constructor(private readonly port: AuthoritativeRoomPort) {}

  async handleJoin(client: ColyseusClientLike, options: WorldRoomJoinOptions): Promise<{ playerId: string }> {
    const clientVersion = options.clientProtocolVersion ?? 1;
    if (clientVersion < MIN_CLIENT_PROTOCOL_VERSION) {
      client.send(SOCKET_SESSION_EVENTS.connectionRejected, {
        reason: 'outdatedProtocol',
        message: `This server requires protocol v${MIN_CLIENT_PROTOCOL_VERSION} or higher.`,
      });
      runtimeMetrics.increment('room.joinRejected.outdatedProtocol');
      throw new Error(`Rejected outdated protocol version ${clientVersion}`);
    }

    const playerName = options.playerName?.trim() || 'Player';
    const result = await this.port.joinClient(client.sessionId, playerName, makeColyseusClient(client));
    runtimeMetrics.increment('room.joins');
    return result;
  }

  async handleLeave(client: ColyseusClientLike): Promise<string | undefined> {
    const playerId = await this.port.leaveClient(client.sessionId);
    if (playerId) {
      runtimeMetrics.increment('room.leaves');
    }
    return playerId;
  }

  handleMessage(client: ColyseusClientLike, message: unknown): boolean {
    const parsed = safeParseClientMessage(message);
    if (!parsed.success) {
      console.warn(`Rejected invalid Colyseus client message from ${client.sessionId}: ${describeProtocolError(parsed.error)}`);
      runtimeMetrics.increment('clientMessages.rejected');
      return false;
    }

    runtimeMetrics.increment('clientMessages.accepted');
    runtimeMetrics.increment(`clientMessages.type.${parsed.data.type}`);
    this.dispatchCommand(client, parsed.data);
    return true;
  }

  dispatchCommand(client: ColyseusClientLike, command: ClientMessage): void {
    this.port.dispatchCommand(client.sessionId, command, makeColyseusClient(client));
  }
}

export function makeColyseusOutbound(
  room: ColyseusBroadcastLike,
  visibility?: ColyseusVisibilitySource,
): OutboundEventSink {
  return {
    publish(event) {
      emitColyseusOutbound(room, event, visibility);
    },
  };
}

function emitColyseusOutbound(
  room: ColyseusBroadcastLike,
  event: OutboundEvent,
  visibility?: ColyseusVisibilitySource,
): void {
  switch (event.type) {
    case 'serverMessage':
      if (emitScopedServerMessage(room, event.message, visibility)) {
        return;
      }
      room.broadcast(WORLD_BROADCAST_EVENTS.message, event.message);
      return;
    case 'directServerMessage':
      findClient(room, event.socketId)?.send(WORLD_BROADCAST_EVENTS.message, event.message);
      return;
    case 'playerUpdated':
      if (emitScopedEntityEvent(
        room,
        WORLD_BROADCAST_EVENTS.playerUpdated,
        sanitizePlayerUpdateForPublic(event.update),
        event.update.id,
        visibility,
      )) {
        return;
      }
      room.broadcast(WORLD_BROADCAST_EVENTS.playerUpdated, sanitizePlayerUpdateForPublic(event.update));
      return;
    case 'enemyUpdated':
      if (emitScopedEntityEvent(
        room,
        WORLD_BROADCAST_EVENTS.enemyUpdated,
        event.update,
        event.update.id,
        visibility,
      )) {
        return;
      }
      room.broadcast(WORLD_BROADCAST_EVENTS.enemyUpdated, event.update);
      return;
  }
}

function makeColyseusClient(client: ColyseusClientLike): AuthoritativeRoomClient {
  return {
    emit(event: string, payload: unknown) {
      return client.send(event, payload);
    },
  };
}

function findClient(room: ColyseusBroadcastLike, sessionId: string): ColyseusClientLike | undefined {
  for (const client of room.clients ?? []) {
    if (client.sessionId === sessionId) {
      return client;
    }
  }

  return undefined;
}

function emitScopedServerMessage(
  room: ColyseusBroadcastLike,
  message: ServerMessage,
  visibility?: ColyseusVisibilitySource,
): boolean {
  const context = getVisibilityContext(visibility);
  if (!context) {
    return false;
  }

  for (const client of room.clients ?? []) {
    const filteredMessage = filterServerMessageForClient(message, client.sessionId, context.state, context.regions);
    if (filteredMessage) {
      client.send(WORLD_BROADCAST_EVENTS.message, filteredMessage);
    }
  }

  return true;
}

function emitScopedEntityEvent(
  room: ColyseusBroadcastLike,
  eventName: string,
  payload: unknown,
  entityId: string,
  visibility?: ColyseusVisibilitySource,
): boolean {
  const context = getVisibilityContext(visibility);
  if (!context) {
    return false;
  }

  for (const client of room.clients ?? []) {
    if (isEntityVisibleToSocket(context.state, context.regions, client.sessionId, entityId)) {
      client.send(eventName, payload);
    }
  }

  return true;
}

function filterServerMessageForClient(
  message: ServerMessage,
  socketId: string,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): ServerMessage | null {
  if (message.type !== 'BatchUpdate') {
    return isServerMessageVisibleToClient(message, socketId, state, regions) ? message : null;
  }

  const updates = message.updates
    .map((update) => filterServerMessageForClient(update, socketId, state, regions))
    .filter((update): update is ServerMessage => Boolean(update));

  if (updates.length === 0) {
    return null;
  }

  runtimeMetrics.increment('snapshot.scopedClientBatches');
  runtimeMetrics.increment('snapshot.scopedClientUpdates', updates.length);
  return { ...message, updates };
}

function isServerMessageVisibleToClient(
  message: ServerMessage,
  socketId: string,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): boolean {
  const regionId = getServerMessageRegionId(message, state, regions);
  return isRegionVisibleToSocket(state, regions, socketId, regionId);
}

function getServerMessageRegionId(
  message: ServerMessage,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): string | undefined {
  switch (message.type) {
    case 'PosSnap':
      return getEntityRegionId(state, regions, message.id) ?? getPositionRegionId(regions, message.pos);
    case 'InstantHit':
      return getFirstEntityRegionId(state, regions, message.hitIds) ?? getPositionRegionId(regions, message.targetPos);
    case 'CastSnapshot':
      return getEntityRegionId(state, regions, message.data.casterId) ?? getPositionRegionId(regions, message.data.pos);
    case 'EffectSnapshot':
      return getEffectSnapshotRegionId(message, state, regions);
    case 'CombatLog':
      return getEntityRegionId(state, regions, message.casterId)
        ?? getFirstEntityRegionId(state, regions, message.targets);
    case 'EnemyAttack':
      return getEntityRegionId(state, regions, message.enemyId);
    case 'LootSpawn':
      return getEntityRegionId(state, regions, message.enemyId) ?? getPositionRegionId(regions, message.position);
    case 'LootPickup':
      return getEntityRegionId(state, regions, message.playerId);
    case 'InventoryUpdate':
      return message.playerId ? getEntityRegionId(state, regions, message.playerId) : undefined;
    default:
      return undefined;
  }
}

function getEffectSnapshotRegionId(
  message: Extract<ServerMessage, { type: 'EffectSnapshot' }>,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): string | undefined {
  if ('targetId' in message) {
    return getEntityRegionId(state, regions, message.targetId);
  }

  return getEntityRegionId(state, regions, message.id) ?? getEntityRegionId(state, regions, message.src);
}

function getFirstEntityRegionId(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  entityIds: readonly string[],
): string | undefined {
  for (const entityId of entityIds) {
    const regionId = getEntityRegionId(state, regions, entityId);
    if (regionId) {
      return regionId;
    }
  }

  return undefined;
}

function getVisibilityContext(visibility?: ColyseusVisibilitySource): {
  state: GameState;
  regions: readonly ServerWorldRegion[];
} | null {
  const state = visibility?.getGameState();
  const regions = visibility?.getRegions();
  if (!state || !regions) {
    return null;
  }

  return { state, regions };
}
