import type { EquipSlot } from '../content/equipmentTypes.js';
import { occupiedSlotsForSpec } from '../content/equipmentTypes.js';
import { ITEMS, type Item } from '../content/items.js';
import type {
  CharacterId,
  EquippedEntry,
  ItemInstance,
  ItemInstanceId,
} from './itemInstance.js';

export type InventoryLimits = {
  baseSlots: number;
  bonusSlots: number;
  maxWeight: number;
};

export type CharacterInventory = {
  characterId: CharacterId;
  items: Record<ItemInstanceId, ItemInstance>;
  /** Primary slot → instance id. Multi-slot items appear once under their primary slot. */
  equipment: Partial<Record<EquipSlot, ItemInstanceId>>;
  /** Tracks which secondary slots are occupied by which primary instance. */
  occupancy: Partial<Record<EquipSlot, ItemInstanceId>>;
  limits: InventoryLimits;
};

export type InvariantViolation = string;

export function createEmptyInventory(characterId: CharacterId, limits: InventoryLimits): CharacterInventory {
  return {
    characterId,
    items: {},
    equipment: {},
    occupancy: {},
    limits,
  };
}

/**
 * Validate the inventory aggregate's hard invariants. Returns the list of
 * violations (empty when healthy). Tests run this after every mutation and
 * dev builds may run it too.
 */
export function validateInvariants(
  inventory: CharacterInventory,
  templates: Record<string, Item> = ITEMS,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const seenSlots = new Set<EquipSlot>();

  for (const [instanceId, instance] of Object.entries(inventory.items)) {
    if (instance.instanceId !== instanceId) {
      violations.push(`item ${instanceId} stores mismatched instanceId ${instance.instanceId}`);
    }
    if (instance.ownerId !== inventory.characterId) {
      violations.push(`item ${instanceId} owned by ${instance.ownerId} but aggregate is ${inventory.characterId}`);
    }
    if (instance.location.kind === 'destroyed') {
      violations.push(`item ${instanceId} is destroyed but still present in aggregate.items`);
    }
    const template = templates[instance.templateId];
    if (!template) {
      violations.push(`item ${instanceId} references missing template ${instance.templateId}`);
      continue;
    }
    if (instance.count <= 0) {
      violations.push(`item ${instanceId} has non-positive count ${instance.count}`);
    }
    if (!template.stackable && instance.count !== 1) {
      violations.push(`non-stackable item ${instanceId} (${instance.templateId}) has count ${instance.count}`);
    }
  }

  for (const [slotKey, instanceId] of Object.entries(inventory.equipment)) {
    const slot = slotKey as EquipSlot;
    if (!instanceId) {
      continue;
    }
    const instance = inventory.items[instanceId];
    if (!instance) {
      violations.push(`equipment slot ${slot} references missing instance ${instanceId}`);
      continue;
    }
    if (instance.location.kind !== 'equipped' || instance.location.slot !== slot) {
      violations.push(`item ${instanceId} equipped in ${slot} but location is ${JSON.stringify(instance.location)}`);
    }
    if (seenSlots.has(slot)) {
      violations.push(`primary slot ${slot} referenced twice in equipment map`);
    }
    seenSlots.add(slot);
  }

  for (const [slotKey, instanceId] of Object.entries(inventory.occupancy)) {
    const slot = slotKey as EquipSlot;
    if (!instanceId) {
      continue;
    }
    const instance = inventory.items[instanceId];
    if (!instance) {
      violations.push(`occupancy slot ${slot} references missing instance ${instanceId}`);
      continue;
    }
    const template = templates[instance.templateId];
    const spec = template?.equip;
    if (!spec) {
      violations.push(`occupancy slot ${slot} held by ${instanceId} which has no EquipSpec`);
      continue;
    }
    const occupied = occupiedSlotsForSpec(spec, instance.location.kind === 'equipped' ? instance.location.slot : undefined);
    if (!occupied.includes(slot)) {
      violations.push(`occupancy slot ${slot} held by ${instanceId} but its spec does not cover ${slot}`);
    }
  }

  return violations;
}

/**
 * Resolve the primary equipped entry covering `slot` (handles multi-slot items
 * where `slot` is a secondary occupied slot rather than the equipped primary).
 */
export function entryForSlot(
  inventory: CharacterInventory,
  slot: EquipSlot,
  templates: Record<string, Item> = ITEMS,
): EquippedEntry | null {
  const direct = inventory.equipment[slot];
  if (direct) {
    return makeEntry(inventory, direct, templates);
  }
  const secondary = inventory.occupancy[slot];
  if (secondary) {
    return makeEntry(inventory, secondary, templates);
  }
  return null;
}

function makeEntry(
  inventory: CharacterInventory,
  instanceId: ItemInstanceId,
  templates: Record<string, Item>,
): EquippedEntry | null {
  const instance = inventory.items[instanceId];
  if (!instance || instance.location.kind !== 'equipped') {
    return null;
  }
  const spec = templates[instance.templateId]?.equip;
  if (!spec) {
    return null;
  }
  const occupied = occupiedSlotsForSpec(spec, instance.location.slot);
  return {
    instanceId,
    primarySlot: instance.location.slot,
    occupiedSlots: occupied,
  };
}

/** Items currently inside the player's bag, ordered by their slotIndex. */
export function listInventoryItems(inventory: CharacterInventory): ItemInstance[] {
  return Object.values(inventory.items)
    .filter((instance): instance is ItemInstance => instance.location.kind === 'inventory')
    .sort((a, b) => {
      const ai = a.location.kind === 'inventory' ? a.location.slotIndex ?? Number.MAX_SAFE_INTEGER : 0;
      const bi = b.location.kind === 'inventory' ? b.location.slotIndex ?? Number.MAX_SAFE_INTEGER : 0;
      return ai - bi;
    });
}

export function maxInventorySlotCount(limits: InventoryLimits): number {
  return limits.baseSlots + limits.bonusSlots;
}
