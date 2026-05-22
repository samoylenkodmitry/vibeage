import type { ItemUsed, UseItem } from '../../packages/protocol/messages.js';
import { debug, error, LOG_CATEGORIES, warn } from '../logger.js';
import type { GameState } from '../gameState.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { applyInventoryItemUse, type ItemUsePlayerUpdate } from './itemRuntime.js';
import { instanceAtSlot } from '../../packages/sim/characterInventory.js';
import { ensureCharacterInventory } from './aggregateBridge.js';
import { sendCommandRejected } from '../transport/commandRejected.js';
import type { CommandRejectionReason } from '../../packages/protocol/commandRejections.js';

type ItemUseClient = { id: string };

export type ItemUseResult =
  | {
      ok: true;
      itemUsed: ItemUsed;
      playerUpdated?: ItemUsePlayerUpdate;
    }
  | {
      ok: false;
      reason: string;
    };

const ITEM_USE_LOG_MESSAGES: Record<string, (playerId: string, slotIndex: number, itemId?: string) => string> = {
  playerDead: (playerId) => `Player ${playerId} tried to use item while dead`,
  invalidSlot: (playerId, slotIndex) => `Player ${playerId} tried to use item from invalid or empty slot ${slotIndex}`,
  unknownItem: (playerId, _slotIndex, itemId) => `Player ${playerId} tried to use unknown item ${itemId ?? 'unknown'}`,
  notConsumable: (playerId, _slotIndex, itemId) => `Player ${playerId} tried to use non-consumable item ${itemId ?? 'unknown'}`,
};

export function useItemForPlayer(state: GameState, playerId: string, slotIndex: number): ItemUseResult {
  const player = state.players[playerId];

  if (!player) {
    return { ok: false, reason: 'playerNotFound' };
  }

  if (!player.isAlive) {
    logItemUseRejection('playerDead', playerId, slotIndex);
    return { ok: false, reason: 'playerDead' };
  }

  const instance = instanceAtSlot(ensureCharacterInventory(player), slotIndex);
  const result = applyInventoryItemUse(player, slotIndex);
  if (result.ok === false) {
    logItemUseRejection(result.reason, playerId, slotIndex, instance?.templateId);
    return result;
  }

  logItemUseSuccess(playerId, result.itemUsed);
  return result;
}

function logItemUseRejection(reason: string, playerId: string, slotIndex: number, itemId?: string): void {
  const message = ITEM_USE_LOG_MESSAGES[reason]?.(playerId, slotIndex, itemId);
  if (!message) {
    return;
  }

  if (reason === 'unknownItem') {
    error(LOG_CATEGORIES.SYSTEM, message);
    return;
  }

  warn(LOG_CATEGORIES.PLAYER, message);
}

function logItemUseSuccess(playerId: string, itemUsed: ItemUsed): void {
  if (itemUsed.healthDelta && itemUsed.healthDelta > 0) {
    debug(LOG_CATEGORIES.HEALING, `Player ${playerId} used ${itemUsed.itemId} and healed for ${itemUsed.healthDelta} HP`);
  }

  if (itemUsed.manaDelta && itemUsed.manaDelta > 0) {
    debug(LOG_CATEGORIES.MANA, `Player ${playerId} used ${itemUsed.itemId} and restored ${itemUsed.manaDelta} MP`);
  }
}

export function onUseItem(
  socket: ItemUseClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: UseItem,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'UseItem'>) => sendCommandRejected(direct, 'UseItem', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);

  if (!playerId) {
    error(LOG_CATEGORIES.SYSTEM, `UseItem: No player found for socket ${socket.id}`);
    reject('playerNotFound');
    return;
  }

  const result = useItemForPlayer(state, playerId, msg.slotIndex);
  if (result.ok === false) {
    reject(result.reason as CommandRejectionReason<'UseItem'>);
    return;
  }

  if (result.playerUpdated) {
    emitPlayerUpdated(outbound, result.playerUpdated);
  }

  direct.send(result.itemUsed);
}
