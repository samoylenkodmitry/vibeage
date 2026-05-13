import type { ClientMessage, LootPickup } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../shared/types.js';
import { handleCastReq } from '../combat/castHandler.js';
import { createCombatWorld } from '../combat/combatWorld.js';
import { handleTargetDeath } from '../combat/targetDeath.js';
import type { GameState } from '../gameState.js';
import { onUseItem } from '../inventory/itemUse.js';
import { tryGiveLoot } from '../loot/groundLoot.js';
import { log, LOG_CATEGORIES } from '../logger.js';
import { applyMoveIntent } from '../movement/moveIntent.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import { onRespawnRequest } from '../players/playerLifecycle.js';
import { onLearnSkill, onSetSkillShortcut } from '../skillHandler.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  makeSocketMessageSink,
  type DirectMessageSink,
  type OutboundEventSink,
  type SocketMessageTarget,
} from '../transport/outboundEvents.js';

type WorldClient = SocketMessageTarget & { id: string };

export function handleClientMessage(
  socket: WorldClient,
  state: GameState,
  msg: ClientMessage,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
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
      return;
  }
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
  if (!player || player.socketId !== socket.id) {
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
  if (player?.socketId !== socket.id) {
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
    log(LOG_CATEGORIES.MOVEMENT, 'debug', `Player ${result.playerId} moving to ${JSON.stringify(msg.targetPos)} at speed ${result.speed}`);
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
    console.warn(`Invalid target position in MoveIntent from player ${playerId}: ${JSON.stringify(targetPos)}`);
    return;
  }

  console.warn(`Invalid player ID or wrong socket for MoveIntent: ${playerId}`);
}
