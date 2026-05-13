import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type RefObject } from 'react';
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
  pickUpLoot: (lootId: string) => void;
  useItem: (slotIndex: number) => void;
  respawn: () => void;
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

  const actions = useClientActions(socketRef, stateRef, dispatch);

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
    installE2EHooks(state, actions);
  }, [state, actions]);

  return useMemo(
    () => ({ state, connect, disconnect, ...actions }),
    [state, connect, disconnect, actions],
  );
}

function useClientActions(
  socketRef: RefObject<Socket | null>,
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
): Omit<ClientApi, 'state' | 'connect' | 'disconnect'> {
  const sendMoveIntent = useCallback((target: VecXZ) => {
    const socket = socketRef.current;
    const playerId = stateRef.current?.myPlayerId;
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
  }, [socketRef, stateRef, dispatch]);

  const selectTarget = useCallback((targetId: string | null) => {
    dispatch({ type: 'selectTarget', targetId });
  }, [dispatch]);

  const castSkill = useCallback((skillId: SkillId) => {
    const socket = socketRef.current;
    const current = stateRef.current;
    const player = current ? getMyPlayer(current) : null;
    if (!socket || !current || !player || !player.isAlive || !isSkillKnown(player, skillId)) {
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
  }, [socketRef, stateRef, dispatch]);

  const pickUpLoot = useCallback((lootId: string) => {
    const socket = socketRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (socket && playerId) {
      socket.emit('msg', { type: 'LootPickup', lootId, playerId });
    }
  }, [socketRef, stateRef]);

  const useItem = useCallback((slotIndex: number) => {
    socketRef.current?.emit('msg', { type: 'UseItem', slotIndex, clientTs: Date.now() });
  }, [socketRef]);

  const respawn = useCallback(() => {
    const socket = socketRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (socket && playerId) {
      socket.emit('msg', { type: 'RespawnRequest', id: playerId, clientTs: Date.now() });
    }
  }, [socketRef, stateRef]);

  return useMemo(
    () => ({ sendMoveIntent, selectTarget, castSkill, pickUpLoot, useItem, respawn }),
    [sendMoveIntent, selectTarget, castSkill, pickUpLoot, useItem, respawn],
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
      socket.emit('msg', { type: 'RequestInventory' });
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
    pickUpLoot: (lootId: string) => void;
    useItem: (slotIndex: number) => void;
    respawn: () => void;
  },
) {
  window.__VIBEAGE_VITE_E2E__ = {
    getState: () => ({
      myPlayerId: state.myPlayerId,
      enemyIds: Object.values(state.enemies).filter((enemy) => enemy.isAlive).map((enemy) => enemy.id),
      selectedTargetId: state.selectedTargetId,
      targetWorldPos: state.targetWorldPos,
      lastKnownPlayerPosition: state.myPlayerId ? state.players[state.myPlayerId]?.position ?? null : null,
      playerVitals: state.myPlayerId ? {
        health: state.players[state.myPlayerId]?.health ?? 0,
        maxHealth: state.players[state.myPlayerId]?.maxHealth ?? 0,
        mana: state.players[state.myPlayerId]?.mana ?? 0,
        maxMana: state.players[state.myPlayerId]?.maxMana ?? 0,
        level: state.players[state.myPlayerId]?.level ?? 1,
        experience: state.players[state.myPlayerId]?.experience ?? 0,
        experienceToNextLevel: state.players[state.myPlayerId]?.experienceToNextLevel ?? 100,
        isAlive: state.players[state.myPlayerId]?.isAlive ?? false,
      } : null,
      inventoryItems: state.inventory.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity })),
      groundLootIds: Object.keys(state.groundLoot),
      castSkillIds: Object.values(state.casts).map((cast) => cast.snapshot.skillId),
      visualEventKinds: Object.values(state.visualEvents).map((event) => event.kind),
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
    pickUpFirstLoot: () => {
      const loot = Object.values(state.groundLoot)[0];
      if (!loot) {
        return null;
      }

      api.pickUpLoot(loot.id);
      return loot.id;
    },
    useItem: api.useItem,
    respawn: api.respawn,
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
        playerVitals: {
          health: number;
          maxHealth: number;
          mana: number;
          maxMana: number;
          level: number;
          experience: number;
          experienceToNextLevel: number;
          isAlive: boolean;
        } | null;
        inventoryItems: { itemId: string; quantity: number }[];
        groundLootIds: string[];
        castSkillIds: SkillId[];
        visualEventKinds: string[];
        liveProjectileSkillIds: SkillId[];
      };
      sendMoveIntent: (target: VecXZ) => void;
      selectFirstEnemy: () => string | null;
      castSkill: (skillId: SkillId) => void;
      pickUpFirstLoot: () => string | null;
      useItem: (slotIndex: number) => void;
      respawn: () => void;
    };
  }
}
