import { Client as ColyseusClient, type Room } from 'colyseus.js';

type RoomSocketHandler = (...args: any[]) => any;

export type RoomSocket = {
  id?: string;
  on(event: string, callback: RoomSocketHandler): RoomSocket;
  emit(event: string, ...args: any[]): unknown;
  connect(): void;
  disconnect(): void;
};

export function createColyseusRoomSocket(serverUrl: string): RoomSocket {
  const handlers = new Map<string, Set<RoomSocketHandler>>();
  const client = new ColyseusClient(toColyseusEndpoint(serverUrl));
  let room: Room | null = null;
  let connecting = false;
  let closed = false;

  const socket: RoomSocket = {
    on(event, callback) {
      const eventHandlers = handlers.get(event) ?? new Set<RoomSocketHandler>();
      eventHandlers.add(callback);
      handlers.set(event, eventHandlers);
      return socket;
    },
    emit(event, ...args) {
      if (!room) {
        return false;
      }

      room.send(event, args[0]);
      return true;
    },
    connect() {
      if (connecting || room || closed) {
        return;
      }

      connecting = true;
      client.joinOrCreate('world', {
        playerName: 'Player',
        clientProtocolVersion: 2,
      }).then((joinedRoom) => {
        room = joinedRoom;
        socket.id = joinedRoom.sessionId;
        bindColyseusMessages(joinedRoom, emitLocal);
        joinedRoom.onError((_code, message) => {
          emitLocal('connect_error', new Error(message ?? 'Connection rejected'));
        });
        joinedRoom.onLeave((code) => {
          if (!closed) {
            emitLocal('disconnect', `room left (${code})`);
          }
        });
        emitLocal('connect');
      }).catch((error) => {
        connecting = false;
        emitLocal('connect_error', error instanceof Error ? error : new Error(String(error)));
      });
    },
    disconnect() {
      closed = true;
      room?.leave(true).catch(() => undefined);
      room = null;
      emitLocal('disconnect', 'client disconnect');
    },
  };

  function emitLocal(event: string, ...args: any[]) {
    handlers.get(event)?.forEach((handler) => handler(...args));
  }

  return socket;
}

function bindColyseusMessages(room: Room, emitLocal: (event: string, ...args: any[]) => void): void {
  [
    'connectionRejected',
    'gameState',
    'joinGame',
    'playerJoined',
    'playerLeft',
    'playerUpdated',
    'enemyUpdated',
    'newPlayer',
    'playerMoved',
    'skillCooldownUpdate',
    'msg',
  ].forEach((eventName) => {
    room.onMessage(eventName, (payload: unknown) => emitLocal(eventName, payload));
  });
}

function toColyseusEndpoint(serverUrl: string): string {
  const endpoint = new URL(serverUrl);
  endpoint.pathname = '/colyseus';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}
