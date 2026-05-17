import type {
  EquipFailedMsg,
  EquipItem,
  EquipmentEntry,
  EquipmentUpdateMsg,
  UnequipItem,
} from '../../packages/protocol/messages.js';
import type { EquipSlot } from '../../packages/content/equipmentTypes.js';
import { listInventoryItems } from '../../packages/sim/characterInventory.js';
import { equipItem, unequipSlot } from '../../packages/sim/equipTransactions.js';
import { deriveEquipmentStats } from '../../packages/sim/equipmentStats.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { derivePlayerStats } from '../../packages/sim/playerStats.js';
import { emitPlayerUpdated, type DirectMessageSink, type OutboundEventSink } from '../transport/outboundEvents.js';
import { ensureCharacterInventory, syncLegacyInventory } from './aggregateBridge.js';

const VALID_SLOTS: ReadonlySet<EquipSlot> = new Set<EquipSlot>([
  'HEAD', 'CHEST', 'LEGS', 'GLOVES', 'BOOTS',
  'MAIN_HAND', 'OFF_HAND',
  'NECK', 'EAR_LEFT', 'EAR_RIGHT', 'RING_LEFT', 'RING_RIGHT',
  'BELT', 'CLOAK', 'SHIRT',
]);

function asEquipSlot(value: string | undefined): EquipSlot | undefined {
  if (value === undefined) {
    return undefined;
  }
  return VALID_SLOTS.has(value as EquipSlot) ? (value as EquipSlot) : undefined;
}

export function handleEquipItem(
  player: PlayerState,
  msg: EquipItem,
  direct: DirectMessageSink,
  outbound?: OutboundEventSink,
): void {
  const inv = ensureCharacterInventory(player);
  const bagItems = listInventoryItems(inv);
  const item = bagItems[msg.slotIndex];
  if (!item) {
    sendFail(direct, 'itemNotFound');
    return;
  }
  const requestedSlot = msg.requestedSlot === undefined ? undefined : asEquipSlot(msg.requestedSlot);
  if (msg.requestedSlot !== undefined && requestedSlot === undefined) {
    sendFail(direct, 'invalidSlot');
    return;
  }
  const result = equipItem(inv, item.instanceId, requestedSlot, {
    level: player.level,
    className: player.className,
  });
  if (result.ok === false) {
    sendFail(direct, (result as { ok: false; error: string }).error);
    return;
  }
  syncLegacyInventory(player);
  sendEquipment(direct, player, outbound);
}

export function handleUnequipItem(
  player: PlayerState,
  msg: UnequipItem,
  direct: DirectMessageSink,
  outbound?: OutboundEventSink,
): void {
  const slot = asEquipSlot(msg.slot);
  if (!slot) {
    sendFail(direct, 'invalidSlot');
    return;
  }
  const inv = ensureCharacterInventory(player);
  const result = unequipSlot(inv, slot, { level: player.level, className: player.className });
  if (result.ok === false) {
    sendFail(direct, (result as { ok: false; error: string }).error);
    return;
  }
  syncLegacyInventory(player);
  sendEquipment(direct, player, outbound);
}

export function sendEquipment(
  direct: DirectMessageSink,
  player: PlayerState,
  outbound?: OutboundEventSink,
): void {
  refreshPlayerStatsFromEquipment(player);
  const inv = ensureCharacterInventory(player);
  const entries: EquipmentEntry[] = [];
  for (const [slot, instanceId] of Object.entries(inv.equipment)) {
    if (!instanceId) continue;
    const instance = inv.items[instanceId];
    if (!instance) continue;
    entries.push({ slot, itemId: instance.templateId });
  }
  const message: EquipmentUpdateMsg = { type: 'EquipmentUpdate', equipment: entries };
  direct.send(message);
  // Broadcast the recomputed derived stats so the HUD's Stats panel
  // reflects the equip / unequip immediately. Without this, the
  // numbers stayed at their pre-equip values until the next
  // tick-pipeline snapshot, which surfaced as 'I equipped a shield
  // promising +5 pDef but pDef didn't change in stats'.
  if (outbound) {
    emitPlayerUpdated(outbound, {
      id: player.id,
      stats: player.stats,
      maxHealth: player.maxHealth,
      maxMana: player.maxMana,
      health: player.health,
      mana: player.mana,
    });
  }
}

/**
 * Project the full DerivedPlayerStats block into the PlayerState.stats shape
 * the wire / HUD consumes.
 */
export function projectPlayerStats(derived: ReturnType<typeof derivePlayerStats>): NonNullable<PlayerState['stats']> {
  return {
    dmgMult: derived.dmgMult,
    critChance: derived.critChance,
    critMult: derived.critMult,
    pAtk: derived.pAtk,
    mAtk: derived.mAtk,
    pDef: derived.pDef,
    mDef: derived.mDef,
    hpRegen: derived.hpRegen,
    mpRegen: derived.mpRegen,
    accuracy: derived.accuracy,
    evasion: derived.evasion,
    attackSpeed: derived.attackSpeed,
    castSpeed: derived.castSpeed,
    runSpeed: derived.runSpeed,
    str: derived.str,
    dex: derived.dex,
    con: derived.con,
    int: derived.int,
    wit: derived.wit,
    men: derived.men,
  };
}

/**
 * Re-derive the player's combat multipliers + HP/MP caps from level + class +
 * currently equipped items so equipping a sword actually shows up in damage.
 */
export function refreshPlayerStatsFromEquipment(player: PlayerState): void {
  const inv = ensureCharacterInventory(player);
  const equipmentStats = deriveEquipmentStats(inv);
  const derived = derivePlayerStats(player.level, player.className, equipmentStats, player.race);
  player.stats = projectPlayerStats(derived);
  player.maxHealth = derived.maxHealth;
  player.maxMana = derived.maxMana;
  if (player.health > player.maxHealth) {
    player.health = player.maxHealth;
  }
  if (player.mana > player.maxMana) {
    player.mana = player.maxMana;
  }
}

function sendFail(direct: DirectMessageSink, reason: string): void {
  const message: EquipFailedMsg = { type: 'EquipFailed', reason };
  direct.send(message);
}
