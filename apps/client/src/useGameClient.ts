import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import { safeParseServerMessage, type VecXZ } from '../../../packages/protocol/messages';
import {
  gameClientReducer,
  type GameClientAction,
  getNearestAliveEnemyId,
  getPlayerPosition,
  initialGameClientState,
} from './gameReducer';
import type { EnemyEntity, GameClientState, PlayerEntity, ServerGameState, Vec3 } from './gameTypes';

type ClientApi = {
  state: GameClientState;
  connect: (playerName: string) => void;
  disconnect: () => void;
  sendMoveIntent: (target: VecXZ) => void;
  selectTarget: (targetId: string | null) => void;
  castSkill: (skillId: SkillId) => void;
};

export function useGameClient(): ClientApi {
  const [state, dispatch] = useReducer(gameClientReducer, initialGameClientState);
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    dispatch({ type: 'disconnected', message: 'Disconnected' });
  }, []);

  const connect = useCallback((playerName: string) => {
    socketRef.current?.disconnect();
    dispatch({ type: 'startConnecting' });

    const socket = createSocket();
    socketRef.current = socket;
    bindSocket(socket, playerName, dispatch);
  }, []);

  const sendMoveIntent = useCallback((target: VecXZ) => {
    const socket = socketRef.current;
    const playerId = stateRef.current.myPlayerId;
    if (!socket || !playerId) {
      return;
    }

    socket.emit('msg', {
      type: 'MoveIntent',
      id: playerId,
      targetPos: target,
      clientTs: Date.now(),
    });
    dispatch({ type: 'setMoveTarget', target: { x: target.x, y: 0.02, z: target.z } });
  }, []);

  const selectTarget = useCallback((targetId: string | null) => {
    dispatch({ type: 'selectTarget', targetId });
  }, []);

  const castSkill = useCallback((skillId: SkillId) => {
    const socket = socketRef.current;
    const current = stateRef.current;
    const player = getMyPlayer(current);
    if (!socket || !player || !player.isAlive || !isSkillKnown(player, skillId)) {
      return;
    }

    const targetId = getCastTargetId(current, player);
    if (!targetId && SKILLS[skillId].requiresTarget) {
      return;
    }

    socket.emit('msg', {
      type: 'CastReq',
      id: player.id,
      skillId,
      targetId: targetId ?? undefined,
      clientTs: Date.now(),
    });

    if (targetId) {
      dispatch({ type: 'selectTarget', targetId });
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      dispatch({ type: 'pruneCasts', now: Date.now() });
    }, 1_000);

    return () => {
      window.clearInterval(timer);
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    installE2EHooks(state, { sendMoveIntent, selectTarget, castSkill });
  }, [state, sendMoveIntent, selectTarget, castSkill]);

  return useMemo(
    () => ({ state, connect, disconnect, sendMoveIntent, selectTarget, castSkill }),
    [state, connect, disconnect, sendMoveIntent, selectTarget, castSkill],
  );
}

function createSocket(): Socket {
  return io(getServerUrl(), {
    path: '/socket.io/',
    transports: ['websocket'],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 5,
  });
}

function getServerUrl(): string {
  return import.meta.env.VITE_GAME_SERVER_URL || window.location.origin;
}

function bindSocket(
  socket: Socket,
  playerName: string,
  dispatch: Dispatch<GameClientAction>,
) {
  socket.on('connect', () => {
    dispatch({ type: 'connected' });
    socket.emit('joinGame', { playerName, clientProtocolVersion: 2 });
  });
  socket.on('joinGame', (payload: { playerId?: string }) => {
    if (payload.playerId) {
      dispatch({ type: 'joined', playerId: payload.playerId });
      socket.emit('requestGameState');
    }
  });
  socket.on('gameState', (serverState: ServerGameState) => {
    dispatch({ type: 'gameState', state: serverState });
  });
  socket.on('playerJoined', (player: PlayerEntity) => {
    dispatch({ type: 'playerJoined', player });
  });
  socket.on('playerLeft', (playerId: string) => {
    dispatch({ type: 'playerLeft', playerId });
  });
  socket.on('playerUpdated', (player: Partial<PlayerEntity> & { id: string }) => {
    dispatch({ type: 'playerUpdated', player });
  });
  socket.on('enemyUpdated', (enemy: Partial<EnemyEntity> & { id: string }) => {
    dispatch({ type: 'enemyUpdated', enemy });
  });
  socket.on('msg', (payload: unknown) => processServerPayload(payload, dispatch));
  socket.on('connect_error', (error) => {
    dispatch({ type: 'connectionRejected', message: error.message });
  });
  socket.on('connectionRejected', (payload: { message?: string }) => {
    dispatch({ type: 'connectionRejected', message: payload.message ?? 'Connection rejected' });
  });
  socket.on('disconnect', () => {
    dispatch({ type: 'disconnected', message: 'Disconnected' });
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

function getMyPlayer(state: GameClientState): PlayerEntity | null {
  return state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
}

function isSkillKnown(player: PlayerEntity, skillId: SkillId): boolean {
  return player.unlockedSkills?.includes(skillId) ?? false;
}

function getCastTargetId(state: GameClientState, player: PlayerEntity): string | null {
  if (state.selectedTargetId && state.enemies[state.selectedTargetId]?.isAlive) {
    return state.selectedTargetId;
  }

  return getNearestAliveEnemyId(state.enemies, getPlayerPosition(player));
}

function installE2EHooks(
  state: GameClientState,
  api: {
    sendMoveIntent: (target: VecXZ) => void;
    selectTarget: (targetId: string | null) => void;
    castSkill: (skillId: SkillId) => void;
  },
) {
  window.__VIBEAGE_VITE_E2E__ = {
    getState: () => ({
      myPlayerId: state.myPlayerId,
      enemyIds: Object.values(state.enemies).filter((enemy) => enemy.isAlive).map((enemy) => enemy.id),
      selectedTargetId: state.selectedTargetId,
      targetWorldPos: state.targetWorldPos,
      lastKnownPlayerPosition: state.myPlayerId ? state.players[state.myPlayerId]?.position ?? null : null,
      castSkillIds: Object.values(state.casts).map((cast) => cast.snapshot.skillId),
      liveProjectileSkillIds: Object.values(state.casts)
        .filter((cast) => cast.snapshot.state !== 2)
        .map((cast) => cast.snapshot.skillId),
    }),
    sendMoveIntent: api.sendMoveIntent,
    selectFirstEnemy: () => {
      const enemy = Object.values(state.enemies).find((candidate) => candidate.isAlive);
      api.selectTarget(enemy?.id ?? null);
      return enemy?.id ?? null;
    },
    castSkill: api.castSkill,
  };
}

declare global {
  interface Window {
    __VIBEAGE_VITE_E2E__?: {
      getState: () => {
        myPlayerId: string | null;
        enemyIds: string[];
        selectedTargetId: string | null;
        targetWorldPos: Vec3 | null;
        lastKnownPlayerPosition: Vec3 | null;
        castSkillIds: SkillId[];
        liveProjectileSkillIds: SkillId[];
      };
      sendMoveIntent: (target: VecXZ) => void;
      selectFirstEnemy: () => string | null;
      castSkill: (skillId: SkillId) => void;
    };
  }
}
