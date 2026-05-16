import type { CharacterClass } from '../content/classes.js';
import {
  EARRING_SLOTS,
  RING_SLOTS,
  occupiedSlotsForSpec,
  type EquipSlot,
  type EquipSpec,
} from '../content/equipmentTypes.js';
import { ITEMS, type Item } from '../content/items.js';
import {
  entryForSlot,
  maxInventorySlotCount,
  validateInvariants,
  type CharacterInventory,
} from './characterInventory.js';
import {
  equippedLocation,
  inventoryLocation,
  type ItemInstance,
  type ItemInstanceId,
} from './itemInstance.js';

export type EquipError =
  | 'itemNotFound'
  | 'notOwned'
  | 'notEquippable'
  | 'invalidSlot'
  | 'levelTooLow'
  | 'wrongClass'
  | 'gradeForbidden'
  | 'twoHandBlocksOffhand'
  | 'uniqueAlreadyEquipped'
  | 'itemLocked'
  | 'inventoryFullForUnequippedItems';

export type EquipContext = {
  level: number;
  className: CharacterClass;
  templates?: Record<string, Item>;
};

export type EquipResult =
  | { ok: true; equipped: ItemInstance; unequipped: ItemInstance[] }
  | { ok: false; error: EquipError };

export type UnequipResult =
  | { ok: true; unequipped: ItemInstance }
  | { ok: false; error: 'itemNotFound' | 'inventoryFullForUnequippedItems' };

function getTemplates(ctx: EquipContext): Record<string, Item> {
  return ctx.templates ?? ITEMS;
}

function resolveTargetSlot(spec: EquipSpec, requestedSlot: EquipSlot | undefined, inventory: CharacterInventory): EquipSlot {
  if (requestedSlot && spec.allowedSlots.includes(requestedSlot)) {
    return requestedSlot;
  }
  if (spec.bodyPart === 'ring') {
    return findEmptyOr(RING_SLOTS, inventory) ?? 'RING_LEFT';
  }
  if (spec.bodyPart === 'earring') {
    return findEmptyOr(EARRING_SLOTS, inventory) ?? 'EAR_LEFT';
  }
  return spec.allowedSlots[0];
}

function findEmptyOr(slots: readonly EquipSlot[], inventory: CharacterInventory): EquipSlot | null {
  for (const slot of slots) {
    if (!inventory.equipment[slot] && !inventory.occupancy[slot]) {
      return slot;
    }
  }
  return null;
}

function checkRequirements(spec: EquipSpec, ctx: EquipContext): EquipError | null {
  const reqs = spec.requirements;
  if (!reqs) {
    return null;
  }
  if (reqs.minLevel !== undefined && ctx.level < reqs.minLevel) {
    return 'levelTooLow';
  }
  if (reqs.classes && reqs.classes.length > 0 && !reqs.classes.includes(ctx.className)) {
    return 'wrongClass';
  }
  return null;
}

function checkUniqueEquipped(
  template: Item,
  instanceId: ItemInstanceId,
  inventory: CharacterInventory,
): boolean {
  if (!template.flags?.includes('uniqueEquipped')) {
    return false;
  }
  for (const equippedId of Object.values(inventory.equipment)) {
    if (!equippedId || equippedId === instanceId) {
      continue;
    }
    const other = inventory.items[equippedId];
    if (other?.templateId === template.id) {
      return true;
    }
  }
  return false;
}

export function equipItem(
  inventory: CharacterInventory,
  instanceId: ItemInstanceId,
  requestedSlot: EquipSlot | undefined,
  context: EquipContext,
): EquipResult {
  const templates = getTemplates(context);
  const instance = inventory.items[instanceId];
  if (!instance) {
    return { ok: false, error: 'itemNotFound' };
  }
  if (instance.ownerId !== inventory.characterId) {
    return { ok: false, error: 'notOwned' };
  }
  if (instance.location.kind !== 'inventory') {
    return { ok: false, error: 'itemLocked' };
  }
  const template = templates[instance.templateId];
  if (!template?.equip) {
    return { ok: false, error: 'notEquippable' };
  }
  const reqError = checkRequirements(template.equip, context);
  if (reqError) {
    return { ok: false, error: reqError };
  }
  if (checkUniqueEquipped(template, instanceId, inventory)) {
    return { ok: false, error: 'uniqueAlreadyEquipped' };
  }
  const targetSlot = resolveTargetSlot(template.equip, requestedSlot, inventory);
  if (!template.equip.allowedSlots.includes(targetSlot)) {
    return { ok: false, error: 'invalidSlot' };
  }
  const occupied = occupiedSlotsForSpec(template.equip, targetSlot);
  if (occupied.length === 0) {
    return { ok: false, error: 'invalidSlot' };
  }

  if (template.equip.bodyPart === 'shield') {
    const mainHand = entryForSlot(inventory, 'MAIN_HAND', templates);
    if (mainHand && mainHand.occupiedSlots.includes('OFF_HAND')) {
      return { ok: false, error: 'twoHandBlocksOffhand' };
    }
  }

  const draft = cloneInventory(inventory);
  const replacedIds = new Set<ItemInstanceId>();
  for (const slot of occupied) {
    const existing = entryForSlot(draft, slot, templates);
    if (existing) {
      replacedIds.add(existing.instanceId);
    }
  }

  const unequipped: ItemInstance[] = [];
  for (const replacedId of replacedIds) {
    const replaced = draft.items[replacedId];
    if (!replaced) {
      continue;
    }
    const refundError = stowEquippedItem(draft, replaced);
    if (refundError) {
      return { ok: false, error: refundError };
    }
    unequipped.push(replaced);
  }

  for (const slot of occupied) {
    draft.occupancy[slot] = instance.instanceId;
  }
  draft.equipment[targetSlot] = instance.instanceId;
  const equippedInstance = draft.items[instance.instanceId];
  if (!equippedInstance) {
    return { ok: false, error: 'itemNotFound' };
  }
  equippedInstance.location = equippedLocation(targetSlot);

  const violations = validateInvariants(draft, templates);
  if (violations.length > 0) {
    return { ok: false, error: 'invalidSlot' };
  }

  applyDraft(inventory, draft);
  return { ok: true, equipped: equippedInstance, unequipped };
}

export function unequipSlot(
  inventory: CharacterInventory,
  slot: EquipSlot,
  context: EquipContext,
): UnequipResult {
  const templates = getTemplates(context);
  const entry = entryForSlot(inventory, slot, templates);
  if (!entry) {
    return { ok: false, error: 'itemNotFound' };
  }
  const draft = cloneInventory(inventory);
  const instance = draft.items[entry.instanceId];
  if (!instance) {
    return { ok: false, error: 'itemNotFound' };
  }
  const refundError = stowEquippedItem(draft, instance);
  if (refundError === 'inventoryFullForUnequippedItems') {
    return { ok: false, error: 'inventoryFullForUnequippedItems' };
  }
  if (refundError) {
    return { ok: false, error: 'itemNotFound' };
  }
  applyDraft(inventory, draft);
  return { ok: true, unequipped: instance };
}

function stowEquippedItem(draft: CharacterInventory, instance: ItemInstance): EquipError | null {
  if (instance.location.kind !== 'equipped') {
    return null;
  }
  const primarySlot = instance.location.slot;
  const template = ITEMS[instance.templateId];
  const spec = template?.equip;
  const occupied = spec ? occupiedSlotsForSpec(spec, primarySlot) : [primarySlot];
  for (const slot of occupied) {
    if (draft.occupancy[slot] === instance.instanceId) {
      delete draft.occupancy[slot];
    }
  }
  if (draft.equipment[primarySlot] === instance.instanceId) {
    delete draft.equipment[primarySlot];
  }
  const targetSlot = findFreeBagSlot(draft);
  if (targetSlot === null) {
    return 'inventoryFullForUnequippedItems';
  }
  instance.location = inventoryLocation(targetSlot);
  return null;
}

function findFreeBagSlot(inventory: CharacterInventory): number | null {
  const used = new Set<number>();
  for (const instance of Object.values(inventory.items)) {
    if (instance.location.kind === 'inventory' && instance.location.slotIndex !== undefined) {
      used.add(instance.location.slotIndex);
    }
  }
  const cap = maxInventorySlotCount(inventory.limits);
  for (let i = 0; i < cap; i += 1) {
    if (!used.has(i)) {
      return i;
    }
  }
  return null;
}

function cloneInventory(inventory: CharacterInventory): CharacterInventory {
  return {
    characterId: inventory.characterId,
    items: Object.fromEntries(
      Object.entries(inventory.items).map(([id, instance]) => [
        id,
        { ...instance, location: { ...instance.location } },
      ]),
    ),
    equipment: { ...inventory.equipment },
    occupancy: { ...inventory.occupancy },
    limits: inventory.limits,
  };
}

function applyDraft(target: CharacterInventory, draft: CharacterInventory): void {
  target.items = draft.items;
  target.equipment = draft.equipment;
  target.occupancy = draft.occupancy;
}
