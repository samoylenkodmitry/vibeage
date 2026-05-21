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
  const equippedInstances = new Set<ItemInstanceId>();

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
    if (template.stackable && template.maxStack !== undefined && instance.count > template.maxStack) {
      violations.push(`item ${instanceId} (${instance.templateId}) count ${instance.count} exceeds max stack ${template.maxStack}`);
    }
  }

  for (const [slotKey, instanceId] of Object.entries(inventory.equipment)) {
    const slot = slotKey as EquipSlot;
    if (!instanceId) {
      continue;
    }
    if (equippedInstances.has(instanceId)) {
      violations.push(`item ${instanceId} appears as the primary in more than one equipment slot`);
    }
    equippedInstances.add(instanceId);
    const instance = inventory.items[instanceId];
    if (!instance) {
      violations.push(`equipment slot ${slot} references missing instance ${instanceId}`);
      continue;
    }
    if (instance.location.kind !== 'equipped' || instance.location.slot !== slot) {
      violations.push(`item ${instanceId} equipped in ${slot} but location is ${JSON.stringify(instance.location)}`);
      continue;
    }
    const spec = templates[instance.templateId]?.equip;
    if (!spec) {
      continue;
    }
    const expected = occupiedSlotsForSpec(spec, slot);
    for (const expectedSlot of expected) {
      if (inventory.occupancy[expectedSlot] !== instanceId) {
        violations.push(
          `item ${instanceId} equipped in ${slot} should occupy ${expectedSlot} but occupancy map has ${inventory.occupancy[expectedSlot] ?? 'nothing'}`,
        );
      }
    }
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
    if (instance.location.kind !== 'equipped') {
      violations.push(`occupancy slot ${slot} held by ${instanceId} but item is not equipped`);
      continue;
    }
    const spec = templates[instance.templateId]?.equip;
    if (!spec) {
      violations.push(`occupancy slot ${slot} held by ${instanceId} which has no EquipSpec`);
      continue;
    }
    const occupied = occupiedSlotsForSpec(spec, instance.location.slot);
    if (!occupied.includes(slot)) {
      violations.push(`occupancy slot ${slot} held by ${instanceId} but its spec does not cover ${slot}`);
    }
    if (inventory.equipment[instance.location.slot] !== instanceId) {
      violations.push(`occupancy slot ${slot} held by ${instanceId} but equipment map does not have it at primary slot ${instance.location.slot}`);
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

type BagItem = ItemInstance & { location: Extract<ItemInstance['location'], { kind: 'inventory' }> };

/** Items currently inside the player's bag, ordered by their slotIndex. */
export function listInventoryItems(inventory: CharacterInventory): ItemInstance[] {
  return Object.values(inventory.items)
    .filter((instance): instance is BagItem => instance.location.kind === 'inventory')
    .sort((a, b) => {
      const ai = a.location.slotIndex ?? Number.MAX_SAFE_INTEGER;
      const bi = b.location.slotIndex ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
}

/**
 * §45.7 — find the bag item that lives at a specific UI slot index.
 * Used by legacy slot-index APIs (item use, craft recipe scan) while
 * we migrate them off the flat `InventorySlot[]` shape.
 */
export function instanceAtSlot(inventory: CharacterInventory, slotIndex: number): ItemInstance | undefined {
  return listInventoryItems(inventory)[slotIndex];
}

/** True when the player's bag has no items (equipped gear doesn't count). */
export function isBagEmpty(inventory: CharacterInventory): boolean {
  return !Object.values(inventory.items).some((instance) => instance.location.kind === 'inventory');
}

export function maxInventorySlotCount(limits: InventoryLimits): number {
  return limits.baseSlots + limits.bonusSlots;
}
