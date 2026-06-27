import { useCallback, useMemo, type Dispatch, type RefObject } from 'react';
import type { Room } from '@colyseus/sdk';
import { classifySkill, SKILLS, type SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import { SESSION_EVENTS } from '../../../packages/protocol/sessionEvents';
import { getEffectiveSkillRange } from '../../../packages/sim/skillUpgrades';
import type { GameClientAction } from './gameReducer';
import {
  getNearestAliveEnemyId,
  getNearestGroundLootId,
  getNextTabTargetId,
  getPlayerPosition,
} from './clientSelectors';
import { BASIC_ATTACK_SKILL_ID } from './skillShortcuts';
import type { EnemyEntity, GameClientState, PlayerEntity } from './gameTypes';
import { isForceCastHeld } from './modifierKeys';
import { nextClientSeq } from './commandSeq';
import { sendFireAndForget, sendRejectable } from './sendGameCommand';
import { saveTrackedQuestId } from './trackedQuestStorage';
import { logBagDiag } from './bagDiag';

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
  /** §46/slice-new — discard an inventory stack to ground-loot at the caller's position. */
  dropItem: (slotIndex: number, count?: number) => void;
  /** Bag context menu — destroy a stack without spawning ground loot. */
  destroyItem: (slotIndex: number, count?: number) => void;
  /** Drag-to-rearrange: move/swap the stack at one bag slot into another. */
  moveInventorySlot: (fromSlotIndex: number, toSlotIndex: number) => void;
  craftItem: (recipeSlotIndex: number) => void;
  equipItem: (slotIndex: number, requestedSlot?: string) => void;
  unequipItem: (slot: string) => void;
  selectClass: (className: string) => void;
  becomeCharacter: (args: { name: string; race: string; className: string; sessionToken: string }) => void;
  selectRace: (race: string) => void;
  selectSpecialization: (specializationId: string) => void;
  upgradeSkill: (skillId: SkillId) => void;
  talkNpc: (npcId: string) => void;
  acceptQuest: (questId: string) => void;
  cancelQuest: (questId: string) => void;
  advanceQuest: (questId: string) => void;
  claimQuestReward: (questId: string) => void;
  buyFromVendor: (vendorId: string, itemId: string, quantity: number) => void;
  sellToVendor: (vendorId: string, itemId: string, quantity: number) => void;
  gmCommand: (cmd: {
    verb:
      | 'grantXp' | 'grantGold' | 'grantSp' | 'grantItem' | 'grantSkill'
      | 'setLevel' | 'setRace' | 'setClass' | 'setSpecialization';
    value: number | string;
    targetId?: string;
    quantity?: number;
  }) => void;
  respawn: () => void;
  devTeleport: (target: VecXZ) => void;
  sendChat: (text: string, scope: 'near' | 'all') => void;
  tryFirePendingCast: () => void;
  tryFirePendingPickup: () => void;
  tryAdvanceAutoAttack: () => void;
  /** §52 playtest follow-up — switches which active quest the
   *  heads-up `QuestTrackerStrip` displays. */
  setTrackedQuest: (questId: string | null) => void;
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

  const { pickupNearest, walkThenPickup, tryFirePendingPickup } = usePickupActions(roomRef, stateRef, dispatch);
  // Click-to-pickup: clicking a loot pile in the world should walk
  // the player into pickup range and grab it on arrival. Same
  // pending-pickup machinery as the `pickupNearest` hotkey path.
  const pickUpLoot = walkThenPickup;

  const { learnSkill, useItem, dropItem, destroyItem, moveInventorySlot, craftItem, equipItem, unequipItem, selectClass, becomeCharacter, selectRace, selectSpecialization, upgradeSkill, respawn } =
    useIdentityAndItemActions(roomRef, stateRef);
  const { talkNpc, acceptQuest, cancelQuest, advanceQuest, claimQuestReward, buyFromVendor, sellToVendor, gmCommand } = useQuestActions(roomRef);

  const { devTeleport, sendChat } = useCommandActions(roomRef, stateRef);

  const setTrackedQuest = useCallback((questId: string | null) => {
    dispatch({ type: 'setTrackedQuest', questId });
    // §52 follow-up — write-through to localStorage so the choice
    // survives reload. Read on App mount; reducer is the in-memory
    // source of truth otherwise.
    saveTrackedQuestId(questId);
  }, [dispatch]);

  return useMemo(
    () => ({ sendMoveIntent, selectTarget, cycleTarget, castSkill, attackTarget, learnSkill, pickUpLoot, pickupNearest, useItem, dropItem, destroyItem, moveInventorySlot, craftItem, equipItem, unequipItem, selectClass, becomeCharacter, selectRace, selectSpecialization, upgradeSkill, talkNpc, acceptQuest, cancelQuest, advanceQuest, claimQuestReward, buyFromVendor, sellToVendor, gmCommand, respawn, devTeleport, sendChat, tryFirePendingCast, tryFirePendingPickup, tryAdvanceAutoAttack, setTrackedQuest }),
    [sendMoveIntent, selectTarget, cycleTarget, castSkill, attackTarget, learnSkill, pickUpLoot, pickupNearest, useItem, dropItem, destroyItem, moveInventorySlot, craftItem, equipItem, unequipItem, selectClass, becomeCharacter, selectRace, selectSpecialization, upgradeSkill, talkNpc, acceptQuest, cancelQuest, advanceQuest, claimQuestReward, buyFromVendor, sellToVendor, gmCommand, respawn, devTeleport, sendChat, tryFirePendingCast, tryFirePendingPickup, tryAdvanceAutoAttack, setTrackedQuest],
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
    // PR X — Ctrl held → force-cast: tells the server to bypass the
    // friendly-fire / beneficial-on-enemy gate for this single cast.
    const force = isForceCastHeld();
    room.send(SESSION_EVENTS.message, {
      type: 'CastReq',
      id: player.id,
      skillId,
      targetId: targetId ?? undefined,
      clientTs: Date.now(),
      clientSeq: nextClientSeq(),
      ...(force ? { force: true } : {}),
    });
    // PR LL — only refocus the plate for cross-entity casts; self-casts
    // (Vanish etc.) must not wipe the player's existing enemy selection.
    if (targetId && targetId !== player.id) dispatch({ type: 'selectTarget', targetId });
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
    // Don't arm auto-attack here — it made the player swing Basic Attack on
    // arrival before the skill they pressed. tryFirePendingCast arms it after.
  }, [dispatch, sendApproachIntent]);

  const castSkill = useCallback((skillId: SkillId) => {
    const current = stateRef.current;
    const player = current ? getMyPlayer(current) : null;
    if (!roomRef.current || !current || !player?.isAlive || !isSkillKnown(player, skillId)) return;

    const targetId = resolveCastTargetId(current, player, skillId);
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

  const tryFirePendingCast = useTryFirePendingCast(stateRef, dispatch, fireCastReq, armAutoAttack);
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
  armAutoAttack: (skillId: SkillId, targetId: string) => void,
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
    // PR BB — wait until firmly inside range (not the edge): server
    // position lags the client's prediction, so firing at the boundary
    // tripped CastFail(outofrange) on the first press. Pad with a margin.
    if (isOutOfCastRange(player, target, pending.skillId as SkillId, PENDING_CAST_RANGE_MARGIN)) {
      return;
    }
    dispatch({ type: 'clearPendingCast' });
    fireCastReq(player, pending.skillId as SkillId, pending.targetId);
    // Now that the pressed skill has fired, latch auto-attack the same way
    // a direct in-range cast does (physical skills keep swinging Basic
    // Attack between cooldowns; magical/utility arm nothing).
    armAutoAttackAfterCast(pending.skillId as SkillId, pending.targetId, current, armAutoAttack);
  }, [stateRef, dispatch, fireCastReq, armAutoAttack]);
}

const PENDING_CAST_RANGE_MARGIN = 1.5;

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
    // PR Z — don't fire auto-attack while another cast is in flight.
    // The auto-tick used to interrupt the player's own slash /
    // powerStrike / backstab the moment basicAttack came off
    // cooldown, because firing basicAttack mid-cast would either
    // cancel the active cast (resist roll fails) or get rejected
    // server-side (resist roll succeeds). Either way the auto-tick
    // was making physical skills feel impossible to land.
    if (player.castingSkill) return;
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
    const state = stateRef.current;
    const player = state && playerId ? state.players[playerId] : null;
    logBagDiag('sendPickup', {
      lootId, playerId, hasRoom: Boolean(room),
      inventoryLen: state?.inventory.length,
      filledSlots: state?.inventory.filter((s) => s && s.quantity > 0).length,
      maxInventorySlots: state?.maxInventorySlots,
      playerMaxSlots: player?.maxInventorySlots,
      slotIndexes: state?.inventory.map((s) => s.slotIndex),
    });
    if (room && playerId) sendRejectable(room, { type: 'LootPickup', lootId, playerId });
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

  // Walk-then-pickup against a specific loot stack. Issues a fresh
  // LootPickup immediately if the player is already in range; else
  // it sends an approach intent + arms a pendingPickup so the
  // periodic `tryFirePendingPickup` tick lands the grab on arrival.
  const walkThenPickup = useCallback((lootId: string) => {
    const current = stateRef.current;
    logBagDiag('walkThenPickup', { lootId, hasState: Boolean(current), groundLootCount: current ? Object.keys(current.groundLoot).length : 0 });
    if (!current) return;
    const player = current.myPlayerId ? current.players[current.myPlayerId] : null;
    if (!player?.isAlive) { logBagDiag('walkThenPickup.bail.notAlive', { isAlive: player?.isAlive }); return; }
    const stack = current.groundLoot[lootId];
    if (!stack) { logBagDiag('walkThenPickup.bail.lootGone', { lootId, ids: Object.keys(current.groundLoot) }); return; }
    dispatch({ type: 'clearAutoAttack' });
    const dx = stack.position.x - player.position.x;
    const dz = stack.position.z - player.position.z;
    if (Math.hypot(dx, dz) <= PICKUP_GRAB_RADIUS) {
      sendPickup(lootId);
      return;
    }
    sendApproach({ x: stack.position.x, z: stack.position.z });
    dispatch({
      type: 'setPendingPickup',
      pendingPickup: { lootId, expiresAtTs: Date.now() + PENDING_PICKUP_TTL_MS },
    });
  }, [stateRef, dispatch, sendPickup, sendApproach]);

  const pickupNearest = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const player = current.myPlayerId ? current.players[current.myPlayerId] : null;
    if (!player?.isAlive) return;
    const lootId = getNearestGroundLootId(current.groundLoot, getPlayerPosition(player));
    if (!lootId) return;
    walkThenPickup(lootId);
  }, [stateRef, walkThenPickup]);

  const tryFirePendingPickup = useTryFirePendingPickup(stateRef, dispatch, sendPickup, sendApproach);

  return { pickupNearest, walkThenPickup, tryFirePendingPickup };
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

function useQuestActions(roomRef: RefObject<Room | null>) {
  // Archwork #4 — these were sending without `clientSeq` pre-rework
  // so the server's quest-verb rejection envelopes couldn't be
  // correlated back to specific button presses. The sendRejectable
  // helper auto-stamps clientSeq for every rejectable command.
  const talkNpc = useCallback((npcId: string) => {
    sendFireAndForget(roomRef.current, { type: 'TalkNpc', npcId });
  }, [roomRef]);
  const acceptQuest = useCallback((questId: string) => {
    sendRejectable(roomRef.current, { type: 'AcceptQuest', questId });
  }, [roomRef]);
  const cancelQuest = useCallback((questId: string) => {
    sendRejectable(roomRef.current, { type: 'CancelQuest', questId });
  }, [roomRef]);
  const advanceQuest = useCallback((questId: string) => {
    sendRejectable(roomRef.current, { type: 'AdvanceQuest', questId });
  }, [roomRef]);
  const claimQuestReward = useCallback((questId: string) => {
    sendRejectable(roomRef.current, { type: 'ClaimQuestReward', questId });
  }, [roomRef]);
  const buyFromVendor = useCallback((vendorId: string, itemId: string, quantity: number) => {
    sendRejectable(roomRef.current, { type: 'BuyFromVendor', vendorId, itemId, quantity });
  }, [roomRef]);
  const sellToVendor = useCallback((vendorId: string, itemId: string, quantity: number) => {
    sendRejectable(roomRef.current, { type: 'SellToVendor', vendorId, itemId, quantity });
  }, [roomRef]);
  const gmCommand = useCallback((cmd: {
    verb:
      | 'grantXp' | 'grantGold' | 'grantSp' | 'grantItem' | 'grantSkill'
      | 'setLevel' | 'setRace' | 'setClass' | 'setSpecialization';
    value: number | string;
    targetId?: string;
    quantity?: number;
  }) => {
    sendRejectable(roomRef.current, { type: 'GmCommand', ...cmd });
  }, [roomRef]);
  return { talkNpc, acceptQuest, cancelQuest, advanceQuest, claimQuestReward, buyFromVendor, sellToVendor, gmCommand };
}

function useIdentityAndItemActions(
  roomRef: RefObject<Room | null>,
  stateRef: RefObject<GameClientState>,
) {
  const learnSkill = useCallback((skillId: SkillId) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'LearnSkill', skillId, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const useItem = useCallback((slotIndex: number) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'UseItem', slotIndex, clientTs: Date.now(), clientSeq: nextClientSeq() });
  }, [roomRef]);
  // §46/slice-new — drop a stack (or partial count) to the ground at
  // the caller's position. Server validates ownership + clamps count
  // to the slot's quantity, so an undefined `count` drops the full
  // stack and an out-of-range value is silently clamped.
  const dropItem = useCallback((slotIndex: number, count?: number) => {
    roomRef.current?.send(SESSION_EVENTS.message, count !== undefined
      ? { type: 'DropItem', slotIndex, count, clientSeq: nextClientSeq() }
      : { type: 'DropItem', slotIndex, clientSeq: nextClientSeq() });
  }, [roomRef]);
  // Bag context menu — destroy. Same shape as dropItem but the
  // server skips the loot spawn so the item is gone for good.
  const destroyItem = useCallback((slotIndex: number, count?: number) => {
    roomRef.current?.send(SESSION_EVENTS.message, count !== undefined
      ? { type: 'DestroyItem', slotIndex, count, clientSeq: nextClientSeq() }
      : { type: 'DestroyItem', slotIndex, clientSeq: nextClientSeq() });
  }, [roomRef]);
  // Drag-to-rearrange the bag (server is authoritative on slot order).
  const moveInventorySlot = useCallback((fromSlotIndex: number, toSlotIndex: number) => {
    if (fromSlotIndex !== toSlotIndex) roomRef.current?.send(SESSION_EVENTS.message, { type: 'MoveInventorySlot', fromSlotIndex, toSlotIndex, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const craftItem = useCallback((recipeSlotIndex: number) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'CraftItem', recipeSlotIndex, clientTs: Date.now(), clientSeq: nextClientSeq() });
  }, [roomRef]);
  const equipItem = useCallback((slotIndex: number, requestedSlot?: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'EquipItem', slotIndex, requestedSlot, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const unequipItem = useCallback((slot: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'UnequipItem', slot, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const selectClass = useCallback((className: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'SelectClass', className, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const becomeCharacter = useCallback((args: { name: string; race: string; className: string; sessionToken: string }) =>
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'BecomeCharacter', ...args, clientSeq: nextClientSeq() }), [roomRef]);
  const selectRace = useCallback((race: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'SelectRace', race, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const selectSpecialization = useCallback((specializationId: string) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'SelectSpecialization', specializationId });
  }, [roomRef]);
  const upgradeSkill = useCallback((skillId: SkillId) => {
    roomRef.current?.send(SESSION_EVENTS.message, { type: 'UpgradeSkill', skillId, clientSeq: nextClientSeq() });
  }, [roomRef]);
  const respawn = useCallback(() => {
    const room = roomRef.current;
    const playerId = stateRef.current?.myPlayerId;
    if (room && playerId) {
      room.send(SESSION_EVENTS.message, { type: 'RespawnRequest', id: playerId, clientTs: Date.now() });
    }
  }, [roomRef, stateRef]);
  return { learnSkill, useItem, dropItem, destroyItem, moveInventorySlot, craftItem, equipItem, unequipItem, selectClass, becomeCharacter, selectRace, selectSpecialization, upgradeSkill, respawn };
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
      clientSeq: nextClientSeq(),
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

function isSelfCastable(skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  if (!skill || skill.requiresTarget) return false;
  if (skill.dmg && skill.dmg > 0) return false;
  return Boolean(skill.effects?.length);
}

function effectiveCastRange(player: PlayerEntity, skillId: SkillId): number {
  return getEffectiveSkillRange(skillId, player) ?? 0;
}

function isOutOfCastRange(player: PlayerEntity, target: EnemyEntity, skillId: SkillId, margin = 0): boolean {
  const range = effectiveCastRange(player, skillId);
  if (range <= 0) return false;
  const dx = player.position.x - target.position.x;
  const dz = player.position.z - target.position.z;
  return Math.hypot(dx, dz) > Math.max(0, range - margin);
}

function approachPointToward(player: PlayerEntity, target: EnemyEntity, skillId: SkillId): VecXZ {
  const range = effectiveCastRange(player, skillId);
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

/**
 * PR CC — final target id for a cast, after the friendly-fire
 * auto-fallback. If the player aimed a beneficial skill at an
 * enemy, redirect to self instead of letting the server reject
 * with friendly-fire. Ctrl-cast keeps the explicit override path.
 */
function resolveCastTargetId(state: GameClientState, player: PlayerEntity, skillId: SkillId): string | null {
  const skillDef = SKILLS[skillId];
  // PR LL — selfTarget skills always land on the caster regardless of
  // selection. Send `targetId: undefined` so the server's
  // resolveCastTargets routes the cast at the caster via the
  // `skill.selfTarget` branch, and so the redirect doesn't show up
  // as a "you targeted self" cue downstream.
  if (skillDef?.selfTarget) return null;
  const raw = getCastTargetId(state, player, skillId);
  if (!raw || isForceCastHeld()) return raw;
  if (classifySkill(skillDef?.effects ?? []) !== 'beneficial') return raw;
  if (state.enemies[raw]?.isAlive) return player.id;
  return raw;
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
