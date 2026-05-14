import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type RefObject } from 'react';
import { Client as ColyseusClient, type Room } from '@colyseus/sdk';
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
  learnSkill: (skillId: SkillId) => void;
  pickUpLoot: (lootId: string) => void;
  useItem: (slotIndex: number) => void;
  respawn: () => void;
};

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

export function useGameClient(): ClientApi {
  const [state, dispatch] = useReducer(gameClientReducer, initialGameClientState);
  const { roomRef, connect, disconnect } = useRoomConnection(dispatch);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const actions = useClientActions(roomRef, stateRef, dispatch);

  useEffect(() => {
    const timer = window.setInterval(() => {
      dispatch({ type: 'pruneCasts', now: Date.now() });
    }, 1_000);

    return () => {
      window.clearInterval(timer);
      roomRef.current?.leave(true).catch(() => undefined);
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

function useRoomConnection(dispatch: Dispatch<GameClientAction>) {
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

function useClientActions(
  roomRef: RefObject<Room | null>,
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
): Omit<ClientApi, 'state' | 'connect' | 'disconnect'> {
  const sendMoveIntent = useCallback((target: VecXZ) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (!room || !playerId) {
      return;
    }

    room.send('msg', {
      type: 'MoveIntent',
      id: playerId,
      targetPos: target,
      clientTs: Date.now(),
    });
    dispatch({ type: 'setMoveTarget', target: { x: target.x, y: 0.02, z: target.z } });
  }, [roomRef, stateRef, dispatch]);

  const selectTarget = useCallback((targetId: string | null) => {
    dispatch({ type: 'selectTarget', targetId });
  }, [dispatch]);

  const castSkill = useCallback((skillId: SkillId) => {
    const room = roomRef.current;
    const current = stateRef.current;
    const player = current ? getMyPlayer(current) : null;
    if (!room || !current || !player || !player.isAlive || !isSkillKnown(player, skillId)) {
      return;
    }

    const targetId = getCastTargetId(current, player);
    if (!targetId && SKILLS[skillId].requiresTarget) {
      return;
    }

    room.send('msg', {
      type: 'CastReq',
      id: player.id,
      skillId,
      targetId: targetId ?? undefined,
      clientTs: Date.now(),
    });

    if (targetId) {
      dispatch({ type: 'selectTarget', targetId });
    }
  }, [roomRef, stateRef, dispatch]);

  const pickUpLoot = useCallback((lootId: string) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (room && playerId) {
      room.send('msg', { type: 'LootPickup', lootId, playerId });
    }
  }, [roomRef, stateRef]);

  const learnSkill = useCallback((skillId: SkillId) => {
    roomRef.current?.send('msg', { type: 'LearnSkill', skillId });
  }, [roomRef]);

  const useItem = useCallback((slotIndex: number) => {
    roomRef.current?.send('msg', { type: 'UseItem', slotIndex, clientTs: Date.now() });
  }, [roomRef]);

  const respawn = useCallback(() => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (room && playerId) {
      room.send('msg', { type: 'RespawnRequest', id: playerId, clientTs: Date.now() });
    }
  }, [roomRef, stateRef]);

  return useMemo(
    () => ({ sendMoveIntent, selectTarget, castSkill, learnSkill, pickUpLoot, useItem, respawn }),
    [sendMoveIntent, selectTarget, castSkill, learnSkill, pickUpLoot, useItem, respawn],
  );
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
  room.send('requestGameState');
  room.send('msg', { type: 'RequestInventory' });
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
  room.onMessage('joinGame', (payload: { playerId?: string }) => {
    if (payload.playerId) {
      dispatch({ type: 'joined', playerId: payload.playerId });
    }
  });
  room.onMessage('gameState', (serverState: ServerGameState) => {
    dispatch({ type: 'gameState', state: serverState });
  });
  room.onMessage('playerJoined', (player: PlayerEntity) => {
    dispatch({ type: 'playerJoined', player });
  });
  room.onMessage('playerLeft', (playerId: string) => {
    dispatch({ type: 'playerLeft', playerId });
  });
  room.onMessage('playerUpdated', (player: Partial<PlayerEntity> & { id: string }) => {
    dispatch({ type: 'playerUpdated', player });
  });
  room.onMessage('enemyUpdated', (enemy: Partial<EnemyEntity> & { id: string }) => {
    dispatch({ type: 'enemyUpdated', enemy });
  });
  room.onMessage('msg', (payload: unknown) => processServerPayload(payload, dispatch));
  room.onMessage('connectionRejected', (payload: { message?: string }) => {
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
    learnSkill: (skillId: SkillId) => void;
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
      starterProgress: state.starterProgress,
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
    learnSkill: api.learnSkill,
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
        starterProgress: GameClientState['starterProgress'];
        inventoryItems: { itemId: string; quantity: number }[];
        groundLootIds: string[];
        castSkillIds: SkillId[];
        visualEventKinds: string[];
        liveProjectileSkillIds: SkillId[];
      };
      sendMoveIntent: (target: VecXZ) => void;
      selectFirstEnemy: () => string | null;
      castSkill: (skillId: SkillId) => void;
      learnSkill: (skillId: SkillId) => void;
      pickUpFirstLoot: () => string | null;
      useItem: (slotIndex: number) => void;
      respawn: () => void;
    };
  }
}
