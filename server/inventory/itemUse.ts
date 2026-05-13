import type { Server, Socket } from 'socket.io';
import type { ItemUsed, UseItem } from '../../packages/protocol/messages.js';
import { log, LOG_CATEGORIES } from '../logger.js';
import type { GameState } from '../gameState.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import { applyInventoryItemUse, type ItemUsePlayerUpdate } from './itemRuntime.js';

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

  const slot = player.inventory[slotIndex];
  const result = applyInventoryItemUse(player, slotIndex);
  if (result.ok === false) {
    logItemUseRejection(result.reason, playerId, slotIndex, slot?.itemId);
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

  const category = reason === 'unknownItem' ? LOG_CATEGORIES.SYSTEM : LOG_CATEGORIES.PLAYER;
  const level = reason === 'unknownItem' ? 'error' : 'warn';
  log(category, level, message);
}

function logItemUseSuccess(playerId: string, itemUsed: ItemUsed): void {
  if (itemUsed.healthDelta && itemUsed.healthDelta > 0) {
    log(LOG_CATEGORIES.HEALING, 'info', `Player ${playerId} used ${itemUsed.itemId} and healed for ${itemUsed.healthDelta} HP`);
  }

  if (itemUsed.manaDelta && itemUsed.manaDelta > 0) {
    log(LOG_CATEGORIES.MANA, 'info', `Player ${playerId} used ${itemUsed.itemId} and restored ${itemUsed.manaDelta} MP`);
  }
}

export function onUseItem(socket: Socket, state: GameState, msg: UseItem, io: Server): void {
  const playerId = findPlayerIdBySocket(state, socket.id);

  if (!playerId) {
    log(LOG_CATEGORIES.SYSTEM, 'error', `UseItem: No player found for socket ${socket.id}`);
    return;
  }

  const result = useItemForPlayer(state, playerId, msg.slotIndex);
  if (!result.ok) {
    return;
  }

  if (result.playerUpdated) {
    io.emit('playerUpdated', result.playerUpdated);
  }

  socket.emit('msg', result.itemUsed);
}
