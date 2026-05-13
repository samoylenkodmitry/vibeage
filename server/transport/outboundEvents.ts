import type { ServerMessage } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../shared/types.js';
import { SOCKET_SESSION_EVENTS } from './roomBoundary.js';

export const WORLD_BROADCAST_EVENTS = {
  message: SOCKET_SESSION_EVENTS.message,
  playerJoined: SOCKET_SESSION_EVENTS.playerJoined,
  playerLeft: SOCKET_SESSION_EVENTS.playerLeft,
  playerUpdated: 'playerUpdated',
  enemyUpdated: 'enemyUpdated',
} as const;

export type PlayerUpdate = Partial<PlayerState> & Pick<PlayerState, 'id'>;
export type EnemyUpdate = Partial<Enemy> & Pick<Enemy, 'id'>;

export type OutboundEvent =
  | { type: 'serverMessage'; message: ServerMessage }
  | { type: 'directServerMessage'; socketId: string; message: ServerMessage }
  | { type: 'playerUpdated'; update: PlayerUpdate }
  | { type: 'enemyUpdated'; update: EnemyUpdate }
  | { type: 'playerJoined'; player: PlayerState }
  | { type: 'playerLeft'; playerId: string };

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

export function emitServerMessage(sink: OutboundEventSink, message: ServerMessage): void {
  sink.publish({ type: 'serverMessage', message });
}

export function emitServerMessageToClient(
  sink: OutboundEventSink,
  socketId: string,
  message: ServerMessage,
): void {
  sink.publish({ type: 'directServerMessage', socketId, message });
}

export function emitBatchUpdate(sink: OutboundEventSink, updates: ServerMessage[]): void {
  if (updates.length === 0) {
    return;
  }

  emitServerMessage(sink, { type: 'BatchUpdate', updates });
}

export function emitPlayerUpdated(sink: OutboundEventSink, update: PlayerUpdate): void {
  sink.publish({ type: 'playerUpdated', update });
}

export function emitEnemyUpdated(sink: OutboundEventSink, update: EnemyUpdate): void {
  sink.publish({ type: 'enemyUpdated', update });
}

export function emitPlayerJoined(sink: OutboundEventSink, player: PlayerState): void {
  sink.publish({ type: 'playerJoined', player });
}

export function emitPlayerLeft(sink: OutboundEventSink, playerId: string): void {
  sink.publish({ type: 'playerLeft', playerId });
}
