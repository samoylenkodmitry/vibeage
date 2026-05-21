import type { ClientMessage, LootPickup } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter.js';
import { ensureCharacterInventory } from '../inventory/aggregateBridge.js';
import { handleCastReq } from '../combat/castHandler.js';
import { createCombatWorld } from '../combat/combatWorld.js';
import { handleTargetDeath } from '../combat/targetDeath.js';
import type { GameState } from '../gameState.js';
import { handleEquipItem, handleUnequipItem } from '../inventory/equipHandlers.js';
import {
  applyClassChange,
  applyRaceChange,
  applySkillUpgrade,
  applySpecializationChange,
} from '../players/playerIdentity.js';
import { onUseItem } from '../inventory/itemUse.js';
import { onCraftItem } from '../inventory/craftRecipe.js';
import { onDropItem } from '../inventory/dropItem.js';
import { onDestroyItem } from '../inventory/destroyItem.js';
import { sendCommandRejected } from '../transport/commandRejected.js';
import { tryGiveLoot } from '../loot/groundLoot.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import { applyDevTeleport, isDevCommandsEnabled } from '../movement/devTeleport.js';
import { isGmModeEnabled } from '../players/gmMode.js';
import { applyMoveIntent } from '../movement/moveIntent.js';
import { tryInterruptForNewAction } from '../combat/castInterrupt.js';
import { sharedMovementFreshness, type StaleIntentReason } from '../movement/staleIntentTracker.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import { onRespawnRequest } from '../players/playerLifecycle.js';
import { onLearnSkill, onSetSkillShortcut } from '../players/playerSkills.js';
import {
  applyAcceptQuest,
  applyAdvanceQuest,
  applyCancelQuest,
  applyClaimQuestReward,
  onTalkedToNpcForQuests,
} from '../players/playerQuests.js';
import { applyGmCommand } from '../players/gmCommand.js';
import { applyBuyFromVendor, applySellToVendor } from '../players/playerVendor.js';
import { QUEST_NPCS } from '../../packages/content/npcs.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  makeSocketMessageSink,
  type DirectMessageSink,
  type OutboundEventSink,
  type SocketMessageTarget,
} from '../transport/outboundEvents.js';
import { bucketForCommand, sharedRateLimiter } from './rateLimiter.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';

type WorldClient = SocketMessageTarget & { id: string };

export function handleClientMessage(
  socket: WorldClient,
  state: GameState,
  msg: ClientMessage,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const bucket = bucketForCommand(msg.type);
  if (bucket && !sharedRateLimiter().allow(socket.id, bucket)) {
    debug(LOG_CATEGORIES.SYSTEM, `Rate-limited ${msg.type} from ${socket.id}`);
    runtimeMetrics.increment(`rateLimit.dropped.${msg.type}`);
    runtimeMetrics.increment('rateLimit.dropped.total');
    return;
  }
  const direct = makeSocketMessageSink(socket);
  switch (msg.type) {
    case 'MoveIntent':
      return onMoveIntent(socket, state, msg, outbound);
    case 'CastReq':
      return onCastReq(socket, direct, state, msg, outbound, spatial);
    case 'LearnSkill':
      return onLearnSkill(socket, direct, outbound, state, msg);
    case 'SetSkillShortcut':
      return onSetSkillShortcut(socket, direct, outbound, state, msg);
    case 'RespawnRequest':
      return onRespawnRequest(state, msg, outbound, spatial, socket.id);
    case 'UseItem':
      return onUseItem(socket, direct, state, msg, outbound);
    case 'CraftItem':
      return onCraftItem(socket, direct, state, msg, outbound);
    case 'LootPickup':
      return onLootPickup(socket, direct, state, msg, outbound);
    case 'DropItem':
      return onDropItem(socket, direct, state, msg, outbound);
    case 'DestroyItem':
      return onDestroyItem(socket, direct, state, msg);
    case 'RequestInventory':
      return onRequestInventory(socket, direct, state);
    case 'SelectClass':
      return onSelectClass(socket, direct, state, msg, outbound);
    case 'SelectRace':
      return onSelectRace(socket, direct, state, msg, outbound);
    case 'DevTeleport':
      return onDevTeleport(socket, state, msg);
    case 'ChatRequest':
      return onChatRequest(socket, direct, state, msg, outbound, spatial);
    case 'EquipItem':
      return onEquipItem(socket, direct, state, msg, outbound);
    case 'UnequipItem':
      return onUnequipItem(socket, direct, state, msg, outbound);
    case 'SelectSpecialization':
      return onSelectSpecialization(socket, state, msg, outbound);
    case 'UpgradeSkill':
      return onUpgradeSkill(socket, direct, state, msg, outbound);
    case 'TalkNpc':
      return onTalkNpc(socket, state, msg, outbound);
    case 'AcceptQuest':
      return onQuestVerb(socket, direct, state, msg, outbound, applyAcceptQuest);
    case 'CancelQuest':
      return onQuestVerb(socket, direct, state, msg, outbound, applyCancelQuest);
    case 'AdvanceQuest':
      return onQuestVerb(socket, direct, state, msg, outbound, applyAdvanceQuest);
    case 'ClaimQuestReward':
      return onClaimQuestReward(socket, direct, state, msg, outbound);
    case 'BuyFromVendor':
      return onBuyFromVendor(socket, direct, state, msg, outbound);
    case 'SellToVendor':
      return onSellToVendor(socket, direct, state, msg, outbound);
    case 'GmCommand':
      return onGmCommand(socket, direct, state, msg, outbound);
  }
}

function onBuyFromVendor(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'BuyFromVendor' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'BuyFromVendor', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const result = applyBuyFromVendor(player, msg.vendorId, msg.itemId, msg.quantity, outbound);
  if (result.ok === false) reject(result.reason);
}

function onSellToVendor(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SellToVendor' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'SellToVendor', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const result = applySellToVendor(player, msg.vendorId, msg.itemId, msg.quantity, outbound);
  if (result.ok === false) reject(result.reason);
}

function onGmCommand(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'GmCommand' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'GmCommand', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const caller = state.players[playerId];
  if (!caller) {
    reject('playerNotFound');
    return;
  }
  applyGmCommand(caller, msg, (id) => state.players[id], outbound);
}

function onTalkNpc(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'TalkNpc' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  // TalkNpc has three roles: gates talk-objective progress, gives
  // the dialog UI a server-validated "yes you can interact" signal,
  // and (PR KK) speaks the NPC's greeting line so the Greet button
  // produces visible feedback. Dialog itself is rendered client-side
  // from QUEST_NPCS + QUESTS content.
  onTalkedToNpcForQuests(player, msg.npcId, outbound);
  emitNpcGreeting(player.socketId, msg.npcId, outbound);
}

function emitNpcGreeting(
  socketId: string,
  npcId: string,
  outbound: OutboundEventSink,
): void {
  const npc = QUEST_NPCS[npcId];
  if (!npc) return;
  const text = npc.greet ?? `${npc.name} nods in acknowledgement.`;
  outbound.publish({
    type: 'directServerMessage',
    socketId,
    message: {
      type: 'ChatBroadcast',
      fromId: npc.id,
      fromName: npc.name,
      text,
      scope: 'near',
      ts: Date.now(),
    },
  });
}

function onQuestVerb(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: { type: string; questId: string },
  outbound: OutboundEventSink,
  apply: (player: PlayerState, questId: string, outbound: OutboundEventSink) => boolean,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, msg.type, reason);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return reject('playerNotFound');
  const player = state.players[playerId];
  if (!player) return reject('playerNotFound');
  // §52 playtest follow-up — apply() returns false when the verb can't
  // proceed (unknown quest, no active entry, stage objective not met,
  // already ready-to-claim on Advance). Surface a generic 'noEffect'
  // reason so the client can render a combat-log line instead of the
  // user thinking the button is broken.
  if (!apply(player, msg.questId, outbound)) reject('noEffect');
}

// §52/PR-queue-#4 — ClaimQuestReward forwards GameState to the
// applier so reward items that overflow the bag get spawned as
// a player-owned ground stack instead of being silently lost.
function onClaimQuestReward(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'ClaimQuestReward' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'ClaimQuestReward', reason);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return reject('playerNotFound');
  const player = state.players[playerId];
  if (!player) return reject('playerNotFound');
  // §52 playtest follow-up — applyClaimQuestReward returns false when
  // the quest isn't ready OR the player isn't near the giver NPC. The
  // out-of-range case is the one a player will hit constantly (forget
  // to walk back). Surface a distinct reason so the client can render
  // "you need to be near <giver>" specifically.
  const ok = applyClaimQuestReward(player, msg.questId, outbound, state);
  if (!ok) reject(claimRejectReason(player, msg.questId));
}

function claimRejectReason(player: PlayerState, questId: string): string {
  const entry = player.questState?.active?.[questId];
  if (!entry) return 'notActive';
  if (!entry.readyToClaim) return 'notReady';
  return 'notNearNpc';
}

function onSelectSpecialization(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectSpecialization' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  applySpecializationChange(player, msg.specializationId, outbound);
}

function onUpgradeSkill(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'UpgradeSkill' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'UpgradeSkill', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const result = applySkillUpgrade(player, msg.skillId, outbound);
  if (result.ok === false) reject(result.reason);
}

function onSelectClass(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectClass' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'SelectClass', reason, msg.clientSeq);
  // Identity is locked once the player is in the world. Race / class
  // are chosen in the character-creation flow (PR D2); after that
  // only GMs (VIBEAGE_ENABLE_DEV_COMMANDS=1) can mutate them. The
  // CharacterPanel still surfaces the buttons for GMs and as a no-op
  // for non-GMs (server-rejected).
  if (!isGmModeEnabled()) {
    warn(LOG_CATEGORIES.PLAYER, `SelectClass rejected (not GM) for ${socket.id}`);
    reject('notGm');
    return;
  }
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  applyClassChange(player, msg.className, outbound);
}

function onSelectRace(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectRace' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'SelectRace', reason, msg.clientSeq);
  if (!isGmModeEnabled()) {
    warn(LOG_CATEGORIES.PLAYER, `SelectRace rejected (not GM) for ${socket.id}`);
    reject('notGm');
    return;
  }
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  applyRaceChange(player, msg.race, outbound);
}

function onEquipItem(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'EquipItem' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  handleEquipItem(player, msg, direct, outbound);
  emitInventoryUpdate(direct, player);
}

function onUnequipItem(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'UnequipItem' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  handleUnequipItem(player, msg, direct, outbound);
  emitInventoryUpdate(direct, player);
}

const CHAT_NEAR_RADIUS = 150;

function onChatRequest(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'ChatRequest' }>,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const reject = (reason: string) => sendCommandRejected(direct, 'ChatRequest', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const text = msg.text.trim().slice(0, 240);
  if (!text) {
    reject('emptyText');
    return;
  }
  const broadcast = {
    type: 'ChatBroadcast' as const,
    fromId: playerId,
    fromName: player.name,
    text,
    scope: msg.scope,
    ts: Date.now(),
  };

  if (msg.scope === 'all') {
    outbound.publish({ type: 'serverMessage', message: broadcast });
    return;
  }

  const nearbyIds = spatial.queryCircle({ x: player.position.x, z: player.position.z }, CHAT_NEAR_RADIUS);
  const seen = new Set<string>();
  for (const id of nearbyIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const other = state.players[id];
    if (!other?.socketId) continue;
    outbound.publish({ type: 'directServerMessage', socketId: other.socketId, message: broadcast });
  }
}

function onDevTeleport(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'DevTeleport' }>,
): void {
  if (!isDevCommandsEnabled()) {
    warn(LOG_CATEGORIES.MOVEMENT, `DevTeleport rejected (VIBEAGE_ENABLE_DEV_COMMANDS not set) for ${msg.id}`);
    return;
  }

  const result = applyDevTeleport(state, socket.id, msg);

  if (result.ok === false) {
    warn(LOG_CATEGORIES.MOVEMENT, `DevTeleport rejected: ${result.reason}`, {
      playerId: result.playerId,
      targetPos: msg.targetPos,
    });
    return;
  }

  debug(LOG_CATEGORIES.MOVEMENT, `Player ${result.playerId} teleported`, { targetPos: msg.targetPos });
}

export function createWorldCombatBridge(
  state: GameState,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
) {
  return createCombatWorld(
    state,
    (caster, target) => handleTargetDeath(caster, target, { state, spatial, outbound }),
    (pos, radius) => queryAliveSpatialEntities(state, spatial, pos, radius),
  );
}

function queryAliveSpatialEntities(
  state: GameState,
  spatial: SpatialHashGrid,
  pos: Extract<ClientMessage, { type: 'MoveIntent' }>['targetPos'],
  radius: number,
): Array<Enemy | PlayerState> {
  return spatial.queryCircle(pos, radius)
    .map((id) => state.enemies[id] || state.players[id])
    .filter((entity): entity is Enemy | PlayerState => Boolean(entity?.isAlive));
}

export function emitInventoryUpdate(client: DirectMessageSink, player: PlayerState): void {
  client.send({
    type: 'InventoryUpdate',
    playerId: player.id,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(player)),
    maxInventorySlots: player.maxInventorySlots,
  });
}

function onCastReq(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'CastReq' }>,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const player = state.players[msg.id];
  if (!player) {
    return;
  }
  if (player.socketId !== socket.id) {
    runtimeMetrics.increment('clientMessages.invalidOwnership.CastReq');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
    return;
  }

  handleCastReq(
    socket,
    player,
    msg,
    { direct, outbound },
    createWorldCombatBridge(state, outbound, spatial),
    state.activeCasts,
  );
}

function onLootPickup(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: LootPickup,
  outbound: OutboundEventSink,
): void {
  const player = state.players[msg.playerId];
  if (!player) {
    return;
  }
  if (player.socketId !== socket.id) {
    runtimeMetrics.increment('clientMessages.invalidOwnership.LootPickup');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
    return;
  }

  if (!tryGiveLoot(state, outbound, msg.playerId, msg.lootId)) {
    return;
  }

  emitInventoryUpdate(direct, player);
}

function onMoveIntent(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'MoveIntent' }>,
  outbound: OutboundEventSink,
): void {
  const staleReason = sharedMovementFreshness().check(socket.id, msg.clientTs);
  if (staleReason) {
    incrementStaleMovementCounter(staleReason);
    debug(LOG_CATEGORIES.MOVEMENT, `Dropped stale MoveIntent from ${socket.id}: ${staleReason}`);
    return;
  }

  // Movement during a blocking cast either interrupts it (refund +
  // clear cooldown) or is dropped if the cast is non-interruptable.
  // See server/combat/castInterrupt.ts.
  const player = state.players[msg.id];
  if (player && player.castingSkill) {
    const verdict = tryInterruptForNewAction(player, state.activeCasts, outbound, 'movement');
    if (verdict === 'block') {
      debug(LOG_CATEGORIES.MOVEMENT, `MoveIntent rejected: player ${msg.id} is in a non-interruptable cast`);
      return;
    }
  }

  const result = applyMoveIntent(state, socket.id, msg);

  if (result.ok === false) {
    warnRejectedMoveIntent(result.reason, result.playerId, msg.targetPos);
    return;
  }

  if (result.kind === 'move') {
    debug(LOG_CATEGORIES.MOVEMENT, `Player ${result.playerId} moving`, {
      targetPos: msg.targetPos,
      speed: result.speed,
    });
  }
}

function onRequestInventory(socket: WorldClient, direct: DirectMessageSink, state: GameState): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    return;
  }

  emitInventoryUpdate(direct, state.players[playerId]);
}

function incrementStaleMovementCounter(reason: StaleIntentReason): void {
  runtimeMetrics.increment(`movement.staleIntent.${reason}`);
  runtimeMetrics.increment('movement.staleIntent.total');
}

function warnRejectedMoveIntent(
  reason: 'playerNotFound' | 'socketMismatch' | 'invalidTarget' | 'stunned',
  playerId: string,
  targetPos: Extract<ClientMessage, { type: 'MoveIntent' }>['targetPos'],
): void {
  if (reason === 'invalidTarget') {
    warn(LOG_CATEGORIES.MOVEMENT, `Invalid target position in MoveIntent from player ${playerId}`, { targetPos });
    return;
  }

  if (reason === 'stunned') {
    runtimeMetrics.increment('movement.rejectedStunned');
    debug(LOG_CATEGORIES.MOVEMENT, `MoveIntent rejected: player ${playerId} is stunned`);
    return;
  }

  if (reason === 'socketMismatch') {
    runtimeMetrics.increment('clientMessages.invalidOwnership.MoveIntent');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
  }

  warn(LOG_CATEGORIES.MOVEMENT, `Invalid player ID or wrong socket for MoveIntent: ${playerId}`);
}
