import type { ClientMessage, LootPickup } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { handleCastReq } from '../combat/castHandler.js';
import { createCombatWorld } from '../combat/combatWorld.js';
import { handleTargetDeath } from '../combat/targetDeath.js';
import type { GameState } from '../gameState.js';
import { handleEquipItem, handleUnequipItem } from '../inventory/equipHandlers.js';
import { applyClassChange, applyRaceChange } from '../players/playerIdentity.js';
import { onUseItem } from '../inventory/itemUse.js';
import { tryGiveLoot } from '../loot/groundLoot.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import { applyDevTeleport, isDevCommandsEnabled } from '../movement/devTeleport.js';
import { applyMoveIntent } from '../movement/moveIntent.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import { onRespawnRequest } from '../players/playerLifecycle.js';
import { onLearnSkill, onSetSkillShortcut } from '../players/playerSkills.js';
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
      return onMoveIntent(socket, state, msg);
    case 'CastReq':
      return onCastReq(socket, direct, state, msg, outbound, spatial);
    case 'LearnSkill':
      return onLearnSkill(socket, direct, outbound, state, msg);
    case 'SetSkillShortcut':
      return onSetSkillShortcut(socket, direct, outbound, state, msg);
    case 'RespawnRequest':
      return onRespawnRequest(state, msg, outbound, spatial);
    case 'UseItem':
      return onUseItem(socket, direct, state, msg, outbound);
    case 'LootPickup':
      return onLootPickup(socket, direct, state, msg, outbound);
    case 'RequestInventory':
      return onRequestInventory(socket, direct, state);
    case 'SelectClass':
      return onSelectClass(socket, state, msg, outbound);
    case 'SelectRace':
      return onSelectRace(socket, state, msg, outbound);
    case 'DevTeleport':
      return onDevTeleport(socket, state, msg);
    case 'ChatRequest':
      return onChatRequest(socket, state, msg, outbound, spatial);
    case 'EquipItem':
      return onEquipItem(socket, direct, state, msg);
    case 'UnequipItem':
      return onUnequipItem(socket, direct, state, msg);
  }
}

function onSelectClass(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectClass' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  applyClassChange(player, msg.className, outbound);
}

function onSelectRace(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectRace' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  applyRaceChange(player, msg.race, outbound);
}

function onEquipItem(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'EquipItem' }>,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  handleEquipItem(player, msg, direct);
  emitInventoryUpdate(direct, player);
}

function onUnequipItem(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'UnequipItem' }>,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  handleUnequipItem(player, msg, direct);
  emitInventoryUpdate(direct, player);
}

const CHAT_NEAR_RADIUS = 150;

function onChatRequest(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'ChatRequest' }>,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const text = msg.text.trim().slice(0, 240);
  if (!text) {
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
    inventory: player.inventory,
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
): void {
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

function warnRejectedMoveIntent(
  reason: 'playerNotFound' | 'socketMismatch' | 'invalidTarget',
  playerId: string,
  targetPos: Extract<ClientMessage, { type: 'MoveIntent' }>['targetPos'],
): void {
  if (reason === 'invalidTarget') {
    warn(LOG_CATEGORIES.MOVEMENT, `Invalid target position in MoveIntent from player ${playerId}`, { targetPos });
    return;
  }

  if (reason === 'socketMismatch') {
    runtimeMetrics.increment('clientMessages.invalidOwnership.MoveIntent');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
  }

  warn(LOG_CATEGORIES.MOVEMENT, `Invalid player ID or wrong socket for MoveIntent: ${playerId}`);
}
