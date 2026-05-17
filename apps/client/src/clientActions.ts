import { useCallback, useMemo, type Dispatch, type RefObject } from 'react';
import type { Room } from '@colyseus/sdk';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import { SESSION_EVENTS } from '../../../packages/protocol/sessionEvents';
import type { GameClientAction } from './gameReducer';
import {
  getNearestAliveEnemyId,
  getNearestGroundLootId,
  getNextTabTargetId,
  getPlayerPosition,
} from './clientSelectors';
import { BASIC_ATTACK_SKILL_ID } from './skillShortcuts';
import type { EnemyEntity, GameClientState, PlayerEntity } from './gameTypes';

const PENDING_CAST_TTL_MS = 10_000;
const PENDING_PICKUP_TTL_MS = 12_000;
const PICKUP_GRAB_RADIUS = 2;
// How close we ask to approach. Stop slightly inside the skill's range
// so jitter / server-side stricter distance check doesn't bounce us
// back into "out of range" the moment we arrive.
const APPROACH_RANGE_PADDING = 0.5;

export type ClientActions = {
  sendMoveIntent: (target: VecXZ) => void;
  selectTarget: (targetId: string | null) => void;
  cycleTarget: () => void;
  castSkill: (skillId: SkillId) => void;
  attackTarget: (targetId: string) => void;
  learnSkill: (skillId: SkillId) => void;
  pickUpLoot: (lootId: string) => void;
  pickupNearest: () => void;
  useItem: (slotIndex: number) => void;
  equipItem: (slotIndex: number, requestedSlot?: string) => void;
  unequipItem: (slot: string) => void;
  selectClass: (className: string) => void;
  selectRace: (race: string) => void;
  selectSpecialization: (specializationId: string) => void;
  upgradeSkill: (skillId: SkillId) => void;
  respawn: () => void;
  devTeleport: (target: VecXZ) => void;
  sendChat: (text: string, scope: 'near' | 'all') => void;
  tryFirePendingCast: () => void;
  tryFirePendingPickup: () => void;
  tryAdvanceAutoAttack: () => void;
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
    // A manual move click overrides any in-flight approach intent or
    // auto-attack — the player has redirected, don't surprise them by
    // firing the queued cast / pickup / next swing after they walk
    // to a different spot.
    dispatch({ type: 'clearPendingCast' });
    dispatch({ type: 'clearPendingPickup' });
    dispatch({ type: 'clearAutoAttack' });
  }, [roomRef, stateRef, dispatch]);

  const selectTarget = useCallback((targetId: string | null) => {
    dispatch({ type: 'selectTarget', targetId });
  }, [dispatch]);

  const cycleTarget = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const player = current.myPlayerId ? current.players[current.myPlayerId] : null;
    if (!player) return;
    // Tab from self-selection acts like "I have no enemy yet" and
    // picks the nearest one — selfId is a UI marker, not a target in
    // the enemy roster.
    const currentEnemyId = current.selectedTargetId === player.id ? null : current.selectedTargetId;
    const next = getNextTabTargetId(current.enemies, getPlayerPosition(player), currentEnemyId);
    if (next) {
      dispatch({ type: 'selectTarget', targetId: next });
    }
  }, [stateRef, dispatch]);

  const { castSkill, attackTarget, tryFirePendingCast, tryAdvanceAutoAttack } = useCastActions(roomRef, stateRef, dispatch);

  const pickUpLoot = useCallback((lootId: string) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (room && playerId) {
      room.send(SESSION_EVENTS.message, { type: 'LootPickup', lootId, playerId });
    }
  }, [roomRef, stateRef]);

  const { pickupNearest, tryFirePendingPickup } = usePickupActions(roomRef, stateRef, dispatch);

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

  const selectSpecialization = useCallback((specializationId: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'SelectSpecialization', specializationId });
  }, [roomRef]);

  const upgradeSkill = useCallback((skillId: SkillId) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'UpgradeSkill', skillId });
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
    () => ({ sendMoveIntent, selectTarget, cycleTarget, castSkill, attackTarget, learnSkill, pickUpLoot, pickupNearest, useItem, equipItem, unequipItem, selectClass, selectRace, selectSpecialization, upgradeSkill, respawn, devTeleport, sendChat, tryFirePendingCast, tryFirePendingPickup, tryAdvanceAutoAttack }),
    [sendMoveIntent, selectTarget, cycleTarget, castSkill, attackTarget, learnSkill, pickUpLoot, pickupNearest, useItem, equipItem, unequipItem, selectClass, selectRace, selectSpecialization, upgradeSkill, respawn, devTeleport, sendChat, tryFirePendingCast, tryFirePendingPickup, tryAdvanceAutoAttack],
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

  const armAutoAttack = useCallback((skillId: SkillId, targetId: string) => {
    dispatch({ type: 'setAutoAttack', autoAttack: { skillId, targetId } });
  }, [dispatch]);

  const queueApproachCast = useCallback((player: PlayerEntity, skillId: SkillId, targetEnemy: EnemyEntity) => {
    sendApproachIntent(approachPointToward(player, targetEnemy, skillId));
    dispatch({
      type: 'setPendingCast',
      pendingCast: { skillId, targetId: targetEnemy.id, expiresAtTs: Date.now() + PENDING_CAST_TTL_MS },
    });
    // Arm auto-attack at the same target for any physical skill (or
    // explicit autoRepeat — basicAttack itself) so the player keeps
    // swinging once they arrive in range.
    const skillDef = SKILLS[skillId];
    if (targetEnemy.isAlive && skillDef && (skillDef.autoRepeat || skillDef.kind === 'physical')) {
      armAutoAttack(BASIC_ATTACK_SKILL_ID, targetEnemy.id);
    }
  }, [dispatch, sendApproachIntent, armAutoAttack]);

  const castSkill = useCallback((skillId: SkillId) => {
    const current = stateRef.current;
    const player = current ? getMyPlayer(current) : null;
    if (!roomRef.current || !current || !player?.isAlive || !isSkillKnown(player, skillId)) return;

    const targetId = getCastTargetId(current, player, skillId);
    if (!targetId && SKILLS[skillId].requiresTarget) return;

    const skillDef = SKILLS[skillId];
    // Casting a magical / utility skill manually cancels any running
    // auto-attack — the player just told us to do something else.
    // Physical casts (slash, basicAttack, arrowShot) keep auto-attack
    // alive because they're flavoured the same as the weapon swing.
    if (skillDef && skillDef.kind !== 'physical' && current.autoAttack) {
      dispatch({ type: 'clearAutoAttack' });
    }

    const targetEnemy = targetId ? current.enemies[targetId] : null;
    if (targetEnemy && isOutOfCastRange(player, targetEnemy, skillId)) {
      queueApproachCast(player, skillId, targetEnemy);
      return;
    }

    dispatch({ type: 'clearPendingCast' });
    fireCastReq(player, skillId, targetId);
    armAutoAttackAfterCast(skillId, targetId, current, armAutoAttack);
  }, [roomRef, stateRef, dispatch, queueApproachCast, fireCastReq, armAutoAttack]);

  const tryFirePendingCast = useTryFirePendingCast(stateRef, dispatch, fireCastReq);
  const tryAdvanceAutoAttack = useTryAdvanceAutoAttack(stateRef, dispatch, castSkill);

  const attackTarget = useCallback((targetId: string) => {
    // Select the target then cast basicAttack via the normal path,
    // which handles approach-and-cast and arms auto-attack mode.
    dispatch({ type: 'selectTarget', targetId });
    castSkill(BASIC_ATTACK_SKILL_ID);
  }, [dispatch, castSkill]);

  return { castSkill, attackTarget, tryFirePendingCast, tryAdvanceAutoAttack };
}

/**
 * Decide whether to arm auto-attack after a successful manual cast.
 *
 * - autoRepeat skills (basicAttack today) latch onto themselves so
 *   pressing A once keeps swinging.
 * - Physical skills (slash, arrowShot, etc.) arm Basic Attack on the
 *   same target — the player presses Slash once and continues
 *   swinging with the weapon between cooldowns of their bigger skill.
 * - Magical and utility casts don't arm anything.
 */
function armAutoAttackAfterCast(
  skillId: SkillId,
  targetId: string | null,
  state: GameClientState,
  arm: (skillId: SkillId, targetId: string) => void,
): void {
  if (!targetId) return;
  if (!state.enemies[targetId]?.isAlive) return;
  const skill = SKILLS[skillId];
  if (!skill) return;
  if (skill.autoRepeat) {
    arm(skillId, targetId);
    return;
  }
  if (skill.kind === 'physical') {
    arm(BASIC_ATTACK_SKILL_ID, targetId);
  }
}

function useTryFirePendingCast(
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
  fireCastReq: (player: PlayerEntity, skillId: SkillId, targetId: string | null) => void,
) {
  return useCallback(() => {
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
}

function useTryAdvanceAutoAttack(
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
  castSkill: (skillId: SkillId) => void,
) {
  return useCallback(() => {
    const current = stateRef.current;
    const auto = current?.autoAttack;
    if (!current || !auto) return;
    const player = getMyPlayer(current);
    if (!player?.isAlive) {
      dispatch({ type: 'clearAutoAttack' });
      return;
    }
    const target = current.enemies[auto.targetId];
    if (!target || !target.isAlive) {
      dispatch({ type: 'clearAutoAttack' });
      return;
    }
    // Player deselected → stop auto-swinging. Self-selection counts
    // as "not this enemy anymore".
    if (current.selectedTargetId && current.selectedTargetId !== auto.targetId) {
      dispatch({ type: 'clearAutoAttack' });
      return;
    }
    const cdEnd = player.skillCooldownEndTs?.[auto.skillId] ?? 0;
    if (Date.now() < cdEnd) return;
    // Re-fire by re-entering castSkill — that path handles approach,
    // range check, and auto-re-arms autoAttack against the same target.
    castSkill(auto.skillId as SkillId);
  }, [stateRef, dispatch, castSkill]);
}

function usePickupActions(
  roomRef: RefObject<Room | null>,
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
) {
  const sendPickup = useCallback((lootId: string) => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (room && playerId) {
      room.send(SESSION_EVENTS.message, { type: 'LootPickup', lootId, playerId });
    }
  }, [roomRef, stateRef]);

  const sendApproach = useCallback((target: VecXZ) => {
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

  const pickupNearest = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const player = current.myPlayerId ? current.players[current.myPlayerId] : null;
    if (!player?.isAlive) return;
    const lootId = getNearestGroundLootId(current.groundLoot, getPlayerPosition(player));
    if (!lootId) return;
    const stack = current.groundLoot[lootId];
    if (!stack) return;
    // Pickup is a player-initiated action — it should stop any
    // running auto-attack so the player isn't still swinging at a mob
    // while trying to grab loot.
    dispatch({ type: 'clearAutoAttack' });
    const dx = stack.position.x - player.position.x;
    const dz = stack.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= PICKUP_GRAB_RADIUS) {
      sendPickup(lootId);
      return;
    }
    sendApproach({ x: stack.position.x, z: stack.position.z });
    dispatch({
      type: 'setPendingPickup',
      pendingPickup: { lootId, expiresAtTs: Date.now() + PENDING_PICKUP_TTL_MS },
    });
  }, [stateRef, dispatch, sendPickup, sendApproach]);

  const tryFirePendingPickup = useTryFirePendingPickup(stateRef, dispatch, sendPickup, sendApproach);

  return { pickupNearest, tryFirePendingPickup };
}

function useTryFirePendingPickup(
  stateRef: RefObject<GameClientState>,
  dispatch: Dispatch<GameClientAction>,
  sendPickup: (lootId: string) => void,
  sendApproach: (target: VecXZ) => void,
) {
  return useCallback(() => {
    const current = stateRef.current;
    const pending = current?.pendingPickup;
    if (!current || !pending) return;
    const player = current.myPlayerId ? current.players[current.myPlayerId] : null;
    if (!player?.isAlive || Date.now() >= pending.expiresAtTs) {
      dispatch({ type: 'clearPendingPickup' });
      return;
    }
    const stack = current.groundLoot[pending.lootId];
    if (!stack) {
      // Loot vanished (picked by someone else / despawned / stream
      // dropout). Retry the next-nearest stack — re-aim movement
      // toward it AND swap pendingPickup.lootId so the next tick
      // can land us in grab radius.
      const fallbackId = getNearestGroundLootId(current.groundLoot, getPlayerPosition(player));
      const fallbackStack = fallbackId ? current.groundLoot[fallbackId] : null;
      if (!fallbackStack) {
        dispatch({ type: 'clearPendingPickup' });
        return;
      }
      sendApproach({ x: fallbackStack.position.x, z: fallbackStack.position.z });
      dispatch({
        type: 'setPendingPickup',
        pendingPickup: { lootId: fallbackStack.id, expiresAtTs: pending.expiresAtTs },
      });
      return;
    }
    const dx = stack.position.x - player.position.x;
    const dz = stack.position.z - player.position.z;
    if (Math.hypot(dx, dz) > PICKUP_GRAB_RADIUS) return; // Still walking.
    dispatch({ type: 'clearPendingPickup' });
    sendPickup(pending.lootId);
  }, [stateRef, dispatch, sendPickup, sendApproach]);
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
  // Respect the current selection. If the player explicitly picked a
  // target (self plate or an enemy), don't silently swap it for the
  // nearest enemy when the skill mismatches — that'd be the client
  // making a balance decision for them mid-fight.
  if (state.selectedTargetId === player.id) {
    if (isSelfCastable(skillId)) return null;
    // Damage skill cast at self → the existing selection is wrong
    // for this skill. Don't auto-pick an enemy; let the cast fail so
    // the player notices and retargets.
    return null;
  }
  if (state.selectedTargetId && state.enemies[state.selectedTargetId]?.isAlive) {
    return state.selectedTargetId;
  }

  // No selection at all → falling back to nearest enemy is fine
  // (existing behavior; the player hasn't expressed a preference).
  return getNearestAliveEnemyId(state.enemies, getPlayerPosition(player));
}
