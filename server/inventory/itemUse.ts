import type { Server, Socket } from 'socket.io';
import { ITEMS } from '../../packages/content/items.js';
import type { ItemUsed, UseItem } from '../../packages/protocol/messages.js';
import { log, LOG_CATEGORIES } from '../logger.js';
import type { GameState } from '../gameState.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';

type ItemUsePlayerUpdate = {
  id: string;
  health: number;
};

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

export function useItemForPlayer(state: GameState, playerId: string, slotIndex: number): ItemUseResult {
  const player = state.players[playerId];

  if (!player) {
    return { ok: false, reason: 'playerNotFound' };
  }

  if (!player.isAlive) {
    log(LOG_CATEGORIES.PLAYER, 'warn', `Player ${playerId} tried to use item while dead`);
    return { ok: false, reason: 'playerDead' };
  }

  const slot = player.inventory[slotIndex];
  if (!slot || slot.quantity <= 0) {
    log(LOG_CATEGORIES.PLAYER, 'warn', `Player ${playerId} tried to use item from invalid or empty slot ${slotIndex}`);
    return { ok: false, reason: 'invalidSlot' };
  }

  const itemDef = ITEMS[slot.itemId];
  if (!itemDef) {
    log(LOG_CATEGORIES.SYSTEM, 'error', `Player ${playerId} tried to use unknown item ${slot.itemId}`);
    return { ok: false, reason: 'unknownItem' };
  }

  if (itemDef.type !== 'consumable') {
    log(LOG_CATEGORIES.PLAYER, 'warn', `Player ${playerId} tried to use non-consumable item ${slot.itemId}`);
    return { ok: false, reason: 'notConsumable' };
  }

  let healthDelta = 0;
  const manaDelta = 0;

  if (itemDef.healAmount && itemDef.healAmount > 0) {
    const oldHealth = player.health;
    player.health = Math.min(player.maxHealth, player.health + itemDef.healAmount);
    healthDelta = player.health - oldHealth;

    log(LOG_CATEGORIES.HEALING, 'info', `Player ${playerId} used ${slot.itemId} and healed for ${healthDelta} HP`);
  }

  slot.quantity -= 1;

  return {
    ok: true,
    playerUpdated: healthDelta > 0 ? { id: playerId, health: player.health } : undefined,
    itemUsed: {
      type: 'ItemUsed',
      slotIndex,
      itemId: slot.itemId,
      newQuantity: slot.quantity,
      healthDelta: healthDelta > 0 ? healthDelta : undefined,
      manaDelta: manaDelta > 0 ? manaDelta : undefined,
    },
  };
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
