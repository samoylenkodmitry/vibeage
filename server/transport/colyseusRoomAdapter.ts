import {
  describeProtocolError,
  safeParseClientMessage,
  type ClientMessage,
} from '../../packages/protocol/messages.js';
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

export type ColyseusClientLike = {
  sessionId: string;
  send(type: string, message?: unknown): unknown;
};

export type ColyseusBroadcastLike = {
  clients?: Iterable<ColyseusClientLike>;
  broadcast(type: string, message?: unknown): unknown;
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
      throw new Error(`Rejected outdated protocol version ${clientVersion}`);
    }

    const playerName = options.playerName?.trim() || 'Player';
    return this.port.joinClient(client.sessionId, playerName, makeColyseusClient(client));
  }

  async handleLeave(client: ColyseusClientLike): Promise<string | undefined> {
    return this.port.leaveClient(client.sessionId);
  }

  handleMessage(client: ColyseusClientLike, message: unknown): boolean {
    const parsed = safeParseClientMessage(message);
    if (!parsed.success) {
      console.warn(`Rejected invalid Colyseus client message from ${client.sessionId}: ${describeProtocolError(parsed.error)}`);
      return false;
    }

    this.dispatchCommand(client, parsed.data);
    return true;
  }

  dispatchCommand(client: ColyseusClientLike, command: ClientMessage): void {
    this.port.dispatchCommand(client.sessionId, command, makeColyseusClient(client));
  }
}

export function makeColyseusOutbound(room: ColyseusBroadcastLike): OutboundEventSink {
  return {
    publish(event) {
      emitColyseusOutbound(room, event);
    },
  };
}

function emitColyseusOutbound(room: ColyseusBroadcastLike, event: OutboundEvent): void {
  switch (event.type) {
    case 'serverMessage':
      room.broadcast(WORLD_BROADCAST_EVENTS.message, event.message);
      return;
    case 'directServerMessage':
      findClient(room, event.socketId)?.send(WORLD_BROADCAST_EVENTS.message, event.message);
      return;
    case 'playerUpdated':
      room.broadcast(WORLD_BROADCAST_EVENTS.playerUpdated, sanitizePlayerUpdateForPublic(event.update));
      return;
    case 'enemyUpdated':
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
