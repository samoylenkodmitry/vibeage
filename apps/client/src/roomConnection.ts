import { useCallback, useEffect, useRef, type Dispatch } from 'react';
import { Client as ColyseusClient, type Room } from '@colyseus/sdk';
import { safeParseServerMessage } from '../../../packages/protocol/messages';
import { SESSION_EVENTS } from '../../../packages/protocol/sessionEvents';
import type { GameClientAction } from './gameReducer';
import type { EnemyEntity, PlayerEntity, ServerGameState } from './gameTypes';

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

export function useRoomConnection(dispatch: Dispatch<GameClientAction>) {
  const roomRef = useRef<Room | null>(null);
  const playerNameRef = useRef('');
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(false);
  const startJoinRef = useRef<(playerName: string) => void>(() => undefined);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((reason: string) => {
    if (!shouldReconnectRef.current) {
      return;
    }

    reconnectAttemptsRef.current += 1;
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      dispatch({ type: 'connectionRejected', message: reason });
      return;
    }

    dispatch({ type: 'startConnecting' });
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptsRef.current - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      startJoinRef.current(playerNameRef.current);
    }, delay);
  }, [dispatch]);

  startJoinRef.current = (playerName: string) => {
    joinWorldRoom(playerName, dispatch, {
      onLeave(leftRoom) {
        if (roomRef.current !== leftRoom) {
          return;
        }

        roomRef.current = null;
        scheduleReconnect('Disconnected from the game server.');
      },
    }).then((room) => {
      clearReconnectTimer();
      reconnectAttemptsRef.current = 0;
      roomRef.current = room;
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Connection rejected';
      scheduleReconnect(message);
    });
  };

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    const room = roomRef.current;
    roomRef.current = null;
    room?.leave(true).catch(() => undefined);
    dispatch({ type: 'disconnected', message: 'Disconnected' });
  }, [clearReconnectTimer, dispatch]);

  const connect = useCallback((playerName: string) => {
    shouldReconnectRef.current = true;
    playerNameRef.current = playerName;
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();

    const previousRoom = roomRef.current;
    roomRef.current = null;
    previousRoom?.leave(true).catch(() => undefined);

    dispatch({ type: 'startConnecting' });
    startJoinRef.current(playerName);
  }, [clearReconnectTimer, dispatch]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      const room = roomRef.current;
      roomRef.current = null;
      room?.leave(true).catch(() => undefined);
    };
  }, [clearReconnectTimer]);

  return { roomRef, connect, disconnect };
}

async function joinWorldRoom(
  playerName: string,
  dispatch: Dispatch<GameClientAction>,
  lifecycle?: { onLeave: (room: Room) => void },
): Promise<Room> {
  const client = new ColyseusClient(getColyseusUrl());
  const room = await client.joinOrCreate('world', {
    playerName,
    clientProtocolVersion: 2,
  });

  bindRoom(room, dispatch, lifecycle);
  dispatch({ type: 'connected' });
  room.send(SESSION_EVENTS.requestGameState);
  room.send(SESSION_EVENTS.message, { type: 'RequestInventory' });
  return room;
}

function getColyseusUrl(): string {
  const endpoint = new URL(import.meta.env.VITE_GAME_SERVER_URL || window.location.origin);
  endpoint.pathname = '/colyseus';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

function bindRoom(
  room: Room,
  dispatch: Dispatch<GameClientAction>,
  lifecycle?: { onLeave: (room: Room) => void },
) {
  room.onMessage(SESSION_EVENTS.joinGame, (payload: { playerId?: string }) => {
    if (payload.playerId) {
      dispatch({ type: 'joined', playerId: payload.playerId });
    }
  });
  room.onMessage(SESSION_EVENTS.gameState, (serverState: ServerGameState) => {
    dispatch({ type: 'gameState', state: serverState });
  });
  room.onMessage(SESSION_EVENTS.playerJoined, (player: PlayerEntity) => {
    dispatch({ type: 'playerJoined', player });
  });
  room.onMessage(SESSION_EVENTS.playerLeft, (playerId: string) => {
    dispatch({ type: 'playerLeft', playerId });
  });
  room.onMessage(SESSION_EVENTS.playerUpdated, (player: Partial<PlayerEntity> & { id: string }) => {
    dispatch({ type: 'playerUpdated', player });
  });
  room.onMessage(SESSION_EVENTS.enemyUpdated, (enemy: Partial<EnemyEntity> & { id: string }) => {
    dispatch({ type: 'enemyUpdated', enemy });
  });
  room.onMessage(SESSION_EVENTS.message, (payload: unknown) => processServerPayload(payload, dispatch));
  room.onMessage(SESSION_EVENTS.connectionRejected, (payload: { message?: string }) => {
    dispatch({ type: 'connectionRejected', message: payload.message ?? 'Connection rejected' });
  });
  room.onError((_code, message) => {
    dispatch({ type: 'connectionRejected', message: message ?? 'Connection rejected' });
  });
  room.onLeave(() => {
    dispatch({ type: 'disconnected', message: 'Disconnected' });
    lifecycle?.onLeave(room);
  });
}

function processServerPayload(payload: unknown, dispatch: Dispatch<GameClientAction>) {
  const messages = Array.isArray(payload) ? payload : [payload];
  messages.forEach((message) => processServerMessage(message, dispatch));
}

function processServerMessage(payload: unknown, dispatch: Dispatch<GameClientAction>) {
  const parsed = safeParseServerMessage(payload);
  if (!parsed.success) {
    console.warn('Rejected invalid server message', parsed.error);
    return;
  }

  dispatch({ type: 'serverMessage', message: parsed.data, now: Date.now() });
}
