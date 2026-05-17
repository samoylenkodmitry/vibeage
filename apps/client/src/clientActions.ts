import { useCallback, useMemo, type Dispatch, type RefObject } from 'react';
import type { Room } from '@colyseus/sdk';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import { SESSION_EVENTS } from '../../../packages/protocol/sessionEvents';
import type { GameClientAction } from './gameReducer';
import { getNearestAliveEnemyId, getPlayerPosition } from './clientSelectors';
import type { EnemyEntity, GameClientState, PlayerEntity } from './gameTypes';

const PENDING_CAST_TTL_MS = 10_000;
// How close we ask to approach. Stop slightly inside the skill's range
// so jitter / server-side stricter distance check doesn't bounce us
// back into "out of range" the moment we arrive.
const APPROACH_RANGE_PADDING = 0.5;

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
  tryFirePendingCast: () => void;
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
    // A manual move click overrides any in-flight approach-and-cast —
    // the player has redirected, don't surprise them by firing the
    // queued skill after they walk to a different spot.
    dispatch({ type: 'clearPendingCast' });
  }, [roomRef, stateRef, dispatch]);

  const selectTarget = useCallback((targetId: string | null) => {
    dispatch({ type: 'selectTarget', targetId });
  }, [dispatch]);

  const { castSkill, tryFirePendingCast } = useCastActions(roomRef, stateRef, dispatch);

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
    () => ({ sendMoveIntent, selectTarget, castSkill, learnSkill, pickUpLoot, useItem, equipItem, unequipItem, selectClass, selectRace, respawn, devTeleport, sendChat, tryFirePendingCast }),
    [sendMoveIntent, selectTarget, castSkill, learnSkill, pickUpLoot, useItem, equipItem, unequipItem, selectClass, selectRace, respawn, devTeleport, sendChat, tryFirePendingCast],
  );
}

function useCastActions(
  roomRef: RefObject<Room | null>,
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
) {
  const sendApproachIntent = useCallback((target: VecXZ) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (!room || !playerId) return;
    room.send(SESSION_EVENTS.message, {
      type: 'MoveIntent',
      id: playerId,
      targetPos: target,
      clientTs: Date.now(),
    });
    dispatch({ type: 'setMoveTarget', target: { x: target.x, y: 0.02, z: target.z } });
  }, [roomRef, stateRef, dispatch]);

  const fireCastReq = useCallback((player: PlayerEntity, skillId: SkillId, targetId: string | null) => {
    const room = roomRef.current;
    if (!room) return;
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
  }, [roomRef, dispatch]);

  const castSkill = useCallback((skillId: SkillId) => {
    const room = roomRef.current;
    const current = stateRef.current;
    const player = current ? getMyPlayer(current) : null;
    if (!room || !current || !player || !player.isAlive || !isSkillKnown(player, skillId)) {
      return;
    }

    const targetId = getCastTargetId(current, player, skillId);
    if (!targetId && SKILLS[skillId].requiresTarget) {
      return;
    }

    // Approach-and-cast: if a targeted enemy is selected and out of
    // range, queue the cast and walk toward the target instead of
    // bouncing off the server's outofrange rejection. The interval in
    // useGameClient fires the queued CastReq once we arrive.
    const targetEnemy = targetId ? current.enemies[targetId] : null;
    if (targetEnemy && isOutOfCastRange(player, targetEnemy, skillId)) {
      sendApproachIntent(approachPointToward(player, targetEnemy, skillId));
      dispatch({
        type: 'setPendingCast',
        pendingCast: {
          skillId,
          targetId: targetEnemy.id,
          expiresAtTs: Date.now() + PENDING_CAST_TTL_MS,
        },
      });
      return;
    }

    dispatch({ type: 'clearPendingCast' });
    fireCastReq(player, skillId, targetId);
  }, [roomRef, stateRef, dispatch, sendApproachIntent, fireCastReq]);

  const tryFirePendingCast = useCallback(() => {
    const current = stateRef.current;
    const pending = current?.pendingCast;
    if (!current || !pending) return;
    const player = getMyPlayer(current);
    if (!player || !player.isAlive) {
      dispatch({ type: 'clearPendingCast' });
      return;
    }
    if (Date.now() >= pending.expiresAtTs) {
      dispatch({ type: 'clearPendingCast' });
      return;
    }
    const target = current.enemies[pending.targetId];
    if (!target || !target.isAlive) {
      dispatch({ type: 'clearPendingCast' });
      return;
    }
    if (isOutOfCastRange(player, target, pending.skillId as SkillId)) {
      return;
    }
    dispatch({ type: 'clearPendingCast' });
    fireCastReq(player, pending.skillId as SkillId, pending.targetId);
  }, [stateRef, dispatch, fireCastReq]);

  return { castSkill, tryFirePendingCast };
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

/**
 * A skill is "self-castable" when the server's beneficial-only branch
 * in resolveCastTargets would auto-target the caster: no enemy target
 * is required AND the effects are all beneficial. Today this maps to
 * effects-only skills with no .dmg field — Holy Light, Bless, Divine
 * Shield, Rapid Fire, Shield Wall, Dispel, Evade.
 */
function isSelfCastable(skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  if (!skill || skill.requiresTarget) return false;
  if (skill.dmg && skill.dmg > 0) return false;
  return Boolean(skill.effects?.length);
}

function isOutOfCastRange(player: PlayerEntity, target: EnemyEntity, skillId: SkillId): boolean {
  const range = SKILLS[skillId]?.range ?? 0;
  if (range <= 0) return false;
  const dx = player.position.x - target.position.x;
  const dz = player.position.z - target.position.z;
  return Math.hypot(dx, dz) > range;
}

function approachPointToward(player: PlayerEntity, target: EnemyEntity, skillId: SkillId): VecXZ {
  const range = SKILLS[skillId]?.range ?? 0;
  // Stop just inside range so server-side distance check doesn't kick
  // back to outofrange. For melee (range ≤ 1) walk all the way in.
  const stopAt = Math.max(0, range - APPROACH_RANGE_PADDING);
  const dx = target.position.x - player.position.x;
  const dz = target.position.z - player.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= stopAt || dist === 0) {
    return { x: target.position.x, z: target.position.z };
  }
  const t = (dist - stopAt) / dist;
  return {
    x: player.position.x + dx * t,
    z: player.position.z + dz * t,
  };
}

function getCastTargetId(state: GameClientState, player: PlayerEntity, skillId: SkillId): string | null {
  // Self-targeted (player clicked their own plate). For self-castable
  // beneficials we send no targetId so the server's beneficial-only
  // auto-self-cast path fires. For everything else we fall through to
  // the normal nearest-enemy fallback — otherwise selecting yourself
  // would silently block offensive skills that have no other target.
  if (state.selectedTargetId === player.id) {
    if (isSelfCastable(skillId)) return null;
    return getNearestAliveEnemyId(state.enemies, getPlayerPosition(player));
  }
  if (state.selectedTargetId && state.enemies[state.selectedTargetId]?.isAlive) {
    return state.selectedTargetId;
  }

  return getNearestAliveEnemyId(state.enemies, getPlayerPosition(player));
}
