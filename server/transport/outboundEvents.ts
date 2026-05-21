import type { InventorySlot, ServerMessage } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import { SOCKET_SESSION_EVENTS } from './roomBoundary.js';

export const WORLD_BROADCAST_EVENTS = {
  message: SOCKET_SESSION_EVENTS.message,
  playerUpdated: SOCKET_SESSION_EVENTS.playerUpdated,
  enemyUpdated: SOCKET_SESSION_EVENTS.enemyUpdated,
} as const;

// §45.7 — `inventory` is not stored on PlayerState anymore; it's a
// wire-only projection of `player.characterInventory`. Callers that
// want clients to see a bag update attach the projection here.
export type PlayerUpdate = Partial<PlayerState> & Pick<PlayerState, 'id'> & {
  inventory?: InventorySlot[];
};
export type EnemyUpdate = Partial<Enemy> & Pick<Enemy, 'id'>;

export type OutboundEvent =
  | { type: 'serverMessage'; message: ServerMessage }
  | { type: 'directServerMessage'; socketId: string; message: ServerMessage }
  | { type: 'playerUpdated'; update: PlayerUpdate }
  | { type: 'enemyUpdated'; update: EnemyUpdate };

export interface OutboundEventSink {
  publish(event: OutboundEvent): void;
}

export interface DirectMessageSink {
  send(message: ServerMessage): void;
}

export type SocketMessageTarget = {
  emit(event: string, payload: unknown): unknown;
};

export function makeSocketMessageSink(target: SocketMessageTarget): DirectMessageSink {
  return {
    send(message) {
      target.emit(WORLD_BROADCAST_EVENTS.message, message);
    },
  };
}

// §52 #12 — per-message-type emit counters. Increments at the helper
// call so we count what game code *tried* to emit, regardless of the
// sink (the in-process load test uses a no-op sink; counts still
// land). For BatchUpdate we count one entry per nested message too so
// the snapshot phase doesn't undercount its real outbound work.
function recordOutbound(message: ServerMessage): void {
  runtimeMetrics.increment(`outbound.serverMessage.${message.type}`);
  runtimeMetrics.increment('outbound.serverMessage.total');
  runtimeMetrics.increment('outbound.total');
  if (message.type === 'BatchUpdate') {
    for (const inner of message.updates) {
      runtimeMetrics.increment(`outbound.batched.${inner.type}`);
      runtimeMetrics.increment('outbound.batched.total');
    }
  }
}

export function emitServerMessage(sink: OutboundEventSink, message: ServerMessage): void {
  recordOutbound(message);
  sink.publish({ type: 'serverMessage', message });
}

export function emitServerMessageToClient(
  sink: OutboundEventSink,
  socketId: string,
  message: ServerMessage,
): void {
  recordOutbound(message);
  runtimeMetrics.increment('outbound.directServerMessage');
  sink.publish({ type: 'directServerMessage', socketId, message });
}

export function emitBatchUpdate(sink: OutboundEventSink, updates: ServerMessage[]): void {
  if (updates.length === 0) {
    return;
  }

  emitServerMessage(sink, { type: 'BatchUpdate', updates });
}

export function emitPlayerUpdated(sink: OutboundEventSink, update: PlayerUpdate): void {
  runtimeMetrics.increment('outbound.playerUpdated');
  runtimeMetrics.increment('outbound.total');
  sink.publish({ type: 'playerUpdated', update });
}

export function emitEnemyUpdated(sink: OutboundEventSink, update: EnemyUpdate): void {
  runtimeMetrics.increment('outbound.enemyUpdated');
  runtimeMetrics.increment('outbound.total');
  sink.publish({ type: 'enemyUpdated', update });
}
