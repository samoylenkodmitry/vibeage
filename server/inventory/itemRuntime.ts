import { ITEMS, isUsableConsumable, type Item } from '../../packages/content/items.js';
import type { ItemUsed } from '../../packages/protocol/messages.js';
import type { PlayerState } from '../../shared/types.js';

export type ItemUsePlayerUpdate = {
  id: string;
  health?: number;
  mana?: number;
};

export type ConsumableUseResult =
  | {
      ok: true;
      itemUsed: ItemUsed;
      playerUpdated?: ItemUsePlayerUpdate;
    }
  | {
      ok: false;
      reason: 'invalidSlot' | 'unknownItem' | 'notConsumable';
    };

export function applyInventoryItemUse(player: PlayerState, slotIndex: number): ConsumableUseResult {
  const slot = player.inventory[slotIndex];
  if (!slot || slot.quantity <= 0) {
    return { ok: false, reason: 'invalidSlot' };
  }

  const itemDef = ITEMS[slot.itemId];
  if (!itemDef) {
    return { ok: false, reason: 'unknownItem' };
  }

  if (!isUsableConsumable(itemDef)) {
    return { ok: false, reason: 'notConsumable' };
  }

  const healthDelta = applyHealthRestore(player, itemDef);
  const manaDelta = applyManaRestore(player, itemDef);

  slot.quantity -= 1;

  return {
    ok: true,
    playerUpdated: makePlayerUpdate(player, healthDelta, manaDelta),
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

function applyHealthRestore(player: PlayerState, itemDef: Item): number {
  if (!itemDef.healAmount || itemDef.healAmount <= 0) {
    return 0;
  }

  const oldHealth = player.health;
  player.health = Math.min(player.maxHealth, player.health + itemDef.healAmount);
  return player.health - oldHealth;
}

function applyManaRestore(player: PlayerState, itemDef: Item): number {
  if (!itemDef.manaAmount || itemDef.manaAmount <= 0) {
    return 0;
  }

  const oldMana = player.mana;
  player.mana = Math.min(player.maxMana, player.mana + itemDef.manaAmount);
  return player.mana - oldMana;
}

function makePlayerUpdate(player: PlayerState, healthDelta: number, manaDelta: number): ItemUsePlayerUpdate | undefined {
  if (healthDelta <= 0 && manaDelta <= 0) {
    return undefined;
  }

  const update: ItemUsePlayerUpdate = { id: player.id };
  if (healthDelta > 0) {
    update.health = player.health;
  }
  if (manaDelta > 0) {
    update.mana = player.mana;
  }
  return update;
}
