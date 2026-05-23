import type { ClientMessage, LootPickup } from '../../../packages/protocol/messages.js';
import type { PlayerState } from '../../../packages/sim/entities.js';
import { flattenInventoryToSlots } from '../../../packages/sim/inventoryWireAdapter.js';
import { ensureCharacterInventory } from '../../inventory/aggregateBridge.js';
import { handleEquipItem, handleUnequipItem } from '../../inventory/equipHandlers.js';
import { tryGiveLoot } from '../../loot/groundLoot.js';
import { runtimeMetrics } from '../../observability/runtimeMetrics.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import { sendCommandRejected } from '../../transport/commandRejected.js';
import type { CommandRejectionReason } from '../../../packages/protocol/commandRejections.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function emitInventoryUpdate(client: DirectMessageSink, player: PlayerState): void {
  client.send({
    type: 'InventoryUpdate',
    playerId: player.id,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(player)),
    maxInventorySlots: player.maxInventorySlots,
  });
}

export function onEquipItem(
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

export function onUnequipItem(
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

export function onLootPickup(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: LootPickup,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'LootPickup'>) =>
    sendCommandRejected(direct, 'LootPickup', reason, msg.clientSeq);
  const player = state.players[msg.playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  if (player.socketId !== socket.id) {
    runtimeMetrics.increment('clientMessages.invalidOwnership.LootPickup');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
    return;
  }

  // [BAGDIAG] Server-side inventory snapshot at pickup time. Flows
  // back to the client via console (server logs are not visible from
  // a browser tab) by piggybacking on the CommandRejected envelope
  // when we reject — see the inventoryFull branch below.
  const inv = player.characterInventory;
  const occupied: number[] = [];
  let nonInventoryCount = 0;
  if (inv) {
    for (const instance of Object.values(inv.items)) {
      if (instance.location.kind === 'inventory' && typeof instance.location.slotIndex === 'number') {
        occupied.push(instance.location.slotIndex);
      } else {
        nonInventoryCount += 1;
      }
    }
  }
  const slotCap = inv ? inv.limits.baseSlots + inv.limits.bonusSlots : -1;
  console.log('[BAGDIAG] LootPickup attempt', {
    playerId: msg.playerId,
    lootId: msg.lootId,
    maxInventorySlots: player.maxInventorySlots,
    limits: inv?.limits,
    slotCap,
    occupiedCount: occupied.length,
    occupiedIndices: occupied.sort((a, b) => a - b),
    nonInventoryCount,
  });

  const result = tryGiveLoot(state, outbound, msg.playerId, msg.lootId);
  if (result.ok === false) {
    console.log('[BAGDIAG] LootPickup rejected', { reason: result.reason, slotCap, occupiedCount: occupied.length });
    reject(result.reason);
    return;
  }

  emitInventoryUpdate(direct, player);
}

export function onRequestInventory(socket: WorldClient, direct: DirectMessageSink, state: GameState): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    return;
  }

  emitInventoryUpdate(direct, state.players[playerId]);
}
