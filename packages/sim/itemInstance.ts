import type { EquipSlot } from '../content/equipmentTypes.js';
import type { ItemId } from '../content/items.js';
import type { VecXZ } from '../protocol/messages.js';

export type ItemInstanceId = string;
export type CharacterId = string;

export type ItemLocation =
  | { kind: 'inventory'; slotIndex?: number }
  | { kind: 'equipped'; slot: EquipSlot }
  | { kind: 'warehouse'; warehouseId: string; slotIndex?: number }
  | { kind: 'trade'; tradeId: string }
  | { kind: 'mail'; mailId: string }
  | { kind: 'ground'; worldId: string; position: VecXZ }
  | { kind: 'destroyed' };

export type ItemInstance = {
  instanceId: ItemInstanceId;
  ownerId: CharacterId;
  templateId: ItemId;
  location: ItemLocation;
  count: number;
  enchantLevel: number;
  durability?: number;
  augmentationId?: string;
  bound: boolean;
  /** Unix milliseconds. */
  createdAtTs: number;
};

/** Multi-slot occupancy: a single primary item may claim several paperdoll slots. */
export type EquippedEntry = {
  instanceId: ItemInstanceId;
  primarySlot: EquipSlot;
  occupiedSlots: readonly EquipSlot[];
};

export function inventoryLocation(slotIndex?: number): ItemLocation {
  return { kind: 'inventory', slotIndex };
}

export function equippedLocation(slot: EquipSlot): ItemLocation {
  return { kind: 'equipped', slot };
}

export function destroyedLocation(): ItemLocation {
  return { kind: 'destroyed' };
}
