import type {
  EquipItem,
  EquipmentEntry,
  EquipmentUpdateMsg,
  UnequipItem,
} from '../../packages/protocol/messages.js';
import type { EquipSlot } from '../../packages/content/equipmentTypes.js';
import { instanceAtSlot } from '../../packages/sim/characterInventory.js';
import { equipItem, unequipSlot } from '../../packages/sim/equipTransactions.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { emitPlayerUpdated, type DirectMessageSink, type OutboundEventSink } from '../transport/outboundEvents.js';
import { ensureCharacterInventory } from './aggregateBridge.js';
import { recomputePlayerStats } from '../players/playerStatsRefresh.js';

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
  // §52 #11 — `msg.slotIndex` is now the real aggregate slot index
  // (matches `InventorySlot.slotIndex` on the wire). Was an array
  // position into `listInventoryItems(inv)` pre-§52 — silently wrong
  // when the bag was sparse.
  const item = instanceAtSlot(inv, msg.slotIndex);
  if (!item) {
    sendFail(direct, 'itemNotFound', 'EquipItem', msg.clientSeq);
    return;
  }
  const requestedSlot = msg.requestedSlot === undefined ? undefined : asEquipSlot(msg.requestedSlot);
  if (msg.requestedSlot !== undefined && requestedSlot === undefined) {
    sendFail(direct, 'invalidSlot', 'EquipItem', msg.clientSeq);
    return;
  }
  const result = equipItem(inv, item.instanceId, requestedSlot, {
    level: player.level,
    className: player.className,
  });
  if (result.ok === false) {
    sendFail(direct, (result as { ok: false; error: string }).error, 'EquipItem', msg.clientSeq);
    return;
  }
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
    sendFail(direct, 'invalidSlot', 'UnequipItem', msg.clientSeq);
    return;
  }
  const inv = ensureCharacterInventory(player);
  const result = unequipSlot(inv, slot, { level: player.level, className: player.className });
  if (result.ok === false) {
    sendFail(direct, (result as { ok: false; error: string }).error, 'UnequipItem', msg.clientSeq);
    return;
  }
  sendEquipment(direct, player, outbound);
}

export function sendEquipment(
  direct: DirectMessageSink,
  player: PlayerState,
  outbound?: OutboundEventSink,
): void {
  recomputePlayerStats(player);
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

// §45.3 — projectPlayerStats + refreshPlayerStatsFromEquipment removed.
// Stat computation lives exclusively in
// `server/players/playerStatsRefresh.ts` via `recomputePlayerStats`,
// which builds the contribution list and writes player.stats /
// max{Health,Mana} in one pass. Equip / unequip call sites above
// invoke it through `sendEquipment`.

// §52 #1 — `EquipFailed` retired. The structured `CommandRejected`
// envelope is now the sole channel for equip-side failures; client
// reads it for the combat-log "Couldn't equip: …" line and for ack
// routing on `requestId`.
function sendFail(
  direct: DirectMessageSink,
  reason: string,
  commandType: 'EquipItem' | 'UnequipItem',
  clientSeq?: number,
): void {
  direct.send({
    type: 'CommandRejected',
    commandType,
    reason,
    ...(clientSeq !== undefined ? { requestId: clientSeq } : {}),
  });
}
