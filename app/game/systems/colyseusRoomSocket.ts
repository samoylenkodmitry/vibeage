import { Client as ColyseusClient, type Room } from 'colyseus.js';

type RoomSocketHandler = (...args: any[]) => any;

export type RoomSocket = {
  id?: string;
  on(event: string, callback: RoomSocketHandler): RoomSocket;
  emit(event: string, ...args: any[]): RoomSocket;
  connect(): void;
  disconnect(): void;
};

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

export function createColyseusRoomSocket(serverUrl: string): RoomSocket {
  const handlers = new Map<string, Set<RoomSocketHandler>>();
  const client = new ColyseusClient(toColyseusEndpoint(serverUrl));
  let room: Room | null = null;
  let connecting = false;
  let closed = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const socket: RoomSocket = {
    on(event, callback) {
      const eventHandlers = handlers.get(event) ?? new Set<RoomSocketHandler>();
      eventHandlers.add(callback);
      handlers.set(event, eventHandlers);
      return socket;
    },
    emit(event, ...args) {
      if (room) {
        room.send(event, args[0]);
      }

      return socket;
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
        reconnectAttempts = 0;
        socket.id = joinedRoom.sessionId;
        bindColyseusMessages(joinedRoom, emitLocal);
        joinedRoom.onError((_code, message) => {
          emitLocal('connect_error', new Error(message ?? 'Connection rejected'));
        });
        joinedRoom.onLeave((code) => {
          room = null;
          connecting = false;
          if (!closed) {
            emitLocal('disconnect', `room left (${code})`);
            scheduleReconnect();
          }
        });
        emitLocal('connect');
      }).catch((error) => {
        connecting = false;
        emitLocal('connect_error', error instanceof Error ? error : new Error(String(error)));
        scheduleReconnect();
      });
    },
    disconnect() {
      closed = true;
      clearReconnectTimer();
      room?.leave(true).catch(() => undefined);
      room = null;
      connecting = false;
      emitLocal('disconnect', 'client disconnect');
    },
  };

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    reconnectAttempts += 1;
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      socket.connect();
    }, delay);
  }

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
