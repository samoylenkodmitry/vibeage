import { useCallback, useMemo, type Dispatch, type RefObject } from 'react';
import type { Room } from '@colyseus/sdk';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import { SESSION_EVENTS } from '../../../packages/protocol/sessionEvents';
import type { GameClientAction } from './gameReducer';
import { getNearestAliveEnemyId, getPlayerPosition } from './clientSelectors';
import type { GameClientState, PlayerEntity } from './gameTypes';

export type ClientActions = {
  sendMoveIntent: (target: VecXZ) => void;
  selectTarget: (targetId: string | null) => void;
  castSkill: (skillId: SkillId) => void;
  learnSkill: (skillId: SkillId) => void;
  pickUpLoot: (lootId: string) => void;
  useItem: (slotIndex: number) => void;
  equipItem: (slotIndex: number, requestedSlot?: string) => void;
  unequipItem: (slot: string) => void;
  selectClass: (className: string) => void;
  selectRace: (race: string) => void;
  respawn: () => void;
  devTeleport: (target: VecXZ) => void;
  sendChat: (text: string, scope: 'near' | 'all') => void;
};

export function useClientActions(
  roomRef: RefObject<Room | null>,
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
): ClientActions {
  const sendMoveIntent = useCallback((target: VecXZ) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (!room || !playerId) {
      return;
    }

    room.send(SESSION_EVENTS.message, {
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

    room.send(SESSION_EVENTS.message, {
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
      room.send(SESSION_EVENTS.message, { type: 'LootPickup', lootId, playerId });
    }
  }, [roomRef, stateRef]);

  const learnSkill = useCallback((skillId: SkillId) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'LearnSkill', skillId });
  }, [roomRef]);

  const useItem = useCallback((slotIndex: number) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'UseItem', slotIndex, clientTs: Date.now() });
  }, [roomRef]);

  const equipItem = useCallback((slotIndex: number, requestedSlot?: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'EquipItem', slotIndex, requestedSlot });
  }, [roomRef]);

  const unequipItem = useCallback((slot: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'UnequipItem', slot });
  }, [roomRef]);

  const selectClass = useCallback((className: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'SelectClass', className });
  }, [roomRef]);

  const selectRace = useCallback((race: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'SelectRace', race });
  }, [roomRef]);

  const respawn = useCallback(() => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (room && playerId) {
      room.send(SESSION_EVENTS.message, { type: 'RespawnRequest', id: playerId, clientTs: Date.now() });
    }
  }, [roomRef, stateRef]);

  const { devTeleport, sendChat } = useCommandActions(roomRef, stateRef);

  return useMemo(
    () => ({ sendMoveIntent, selectTarget, castSkill, learnSkill, pickUpLoot, useItem, equipItem, unequipItem, selectClass, selectRace, respawn, devTeleport, sendChat }),
    [sendMoveIntent, selectTarget, castSkill, learnSkill, pickUpLoot, useItem, equipItem, unequipItem, selectClass, selectRace, respawn, devTeleport, sendChat],
  );
}

function useCommandActions(
  roomRef: RefObject<Room | null>,
  stateRef: RefObject<GameClientState>,
) {
  const devTeleport = useCallback((target: VecXZ) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (!room || !playerId) {
      return;
    }
    room.send(SESSION_EVENTS.message, {
      type: 'DevTeleport',
      id: playerId,
      targetPos: target,
      clientTs: Date.now(),
    });
  }, [roomRef, stateRef]);

  const sendChat = useCallback((text: string, scope: 'near' | 'all') => {
    const room = roomRef.current;
    const trimmed = text.trim();
    if (!room || !trimmed) {
      return;
    }
    room.send(SESSION_EVENTS.message, {
      type: 'ChatRequest',
      text: trimmed.slice(0, 240),
      scope,
      clientTs: Date.now(),
    });
  }, [roomRef]);

  return { devTeleport, sendChat };
}

function getMyPlayer(state: GameClientState): PlayerEntity | null {
  return state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
}

function isSkillKnown(player: PlayerEntity, skillId: SkillId): boolean {
  return player.unlockedSkills?.includes(skillId) ?? false;
}

function getCastTargetId(state: GameClientState, player: PlayerEntity): string | null {
  // Self-target: client uses selectedTargetId === player.id as a UI
  // signal ("cast on me"). Don't forward to the server — its
  // beneficial-only auto-self-cast path (impactResolver) needs targetId
  // absent to fire. Offensive skills with no other target then fail
  // cleanly, which is fine (you can't damage yourself).
  if (state.selectedTargetId === player.id) {
    return null;
  }
  if (state.selectedTargetId && state.enemies[state.selectedTargetId]?.isAlive) {
    return state.selectedTargetId;
  }

  return getNearestAliveEnemyId(state.enemies, getPlayerPosition(player));
}
