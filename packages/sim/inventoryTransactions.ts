import { ITEMS, getItemWeight, type Item, type ItemId } from '../content/items.js';
import {
  type CharacterInventory,
  listInventoryItems,
  maxInventorySlotCount,
  validateInvariants,
} from './characterInventory.js';
import {
  inventoryLocation,
  type ItemInstance,
  type ItemInstanceId,
} from './itemInstance.js';

type TransactionError =
  | 'inventoryFull'
  | 'overweight'
  | 'itemNotFound'
  | 'itemLocked'
  | 'notStackable'
  | 'invalidSplitAmount'
  | 'templateMismatch'
  | 'stackOverflow'
  | 'invariantViolation';

export type AddItemsRequest = {
  templateId: ItemId;
  count: number;
};

export type TransactionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: TransactionError };

export type AddItemsOk = {
  added: ItemInstance[];
  changed: ItemInstance[];
};

export type RemoveItemsOk = {
  removed: number;
  removedInstanceIds: ItemInstanceId[];
};

export type InventoryServices = {
  templates?: Record<string, Item>;
  instanceIdFactory: () => string;
  now?: () => number;
};

const defaultNow = () => Date.now();

function getServices(services: InventoryServices) {
  return {
    templates: services.templates ?? ITEMS,
    instanceIdFactory: services.instanceIdFactory,
    now: services.now ?? defaultNow,
  };
}

/**
 * Compute the weight of all items currently owned by the character. Equipped
 * items count too (matches the L2 expectation that gear adds weight).
 */
export function totalInventoryWeight(
  inventory: CharacterInventory,
  templates: Record<string, Item> = ITEMS,
): number {
  let total = 0;
  for (const instance of Object.values(inventory.items)) {
    const template = templates[instance.templateId];
    if (!template) {
      continue;
    }
    if (instance.location.kind !== 'inventory' && instance.location.kind !== 'equipped') {
      continue;
    }
    total += getItemWeight(template) * instance.count;
  }
  return total;
}

/**
 * Atomic addItem. Stacks into existing bag stacks first (respecting maxStack),
 * then creates new bag stacks until the slot cap or weight cap is exhausted.
 * On failure leaves the aggregate unchanged.
 */
export function addItems(
  inventory: CharacterInventory,
  request: AddItemsRequest,
  services: InventoryServices,
): TransactionResult<AddItemsOk> {
  const { templates, instanceIdFactory, now } = getServices(services);
  const template = templates[request.templateId];
  if (!template) {
    return { ok: false, error: 'itemNotFound' };
  }
  if (request.count <= 0) {
    return { ok: true, value: { added: [], changed: [] } };
  }

  const draft = cloneInventory(inventory);
  let remaining = request.count;
  const added: ItemInstance[] = [];
  const changed: ItemInstance[] = [];

  if (template.stackable) {
    const maxStack = template.maxStack ?? Number.MAX_SAFE_INTEGER;
    for (const instance of listInventoryItems(draft)) {
      if (remaining <= 0) {
        break;
      }
      if (instance.templateId !== template.id || instance.count >= maxStack) {
        continue;
      }
      const room = maxStack - instance.count;
      const moved = Math.min(room, remaining);
      instance.count += moved;
      remaining -= moved;
      changed.push(instance);
    }
  }

  const slotCap = maxInventorySlotCount(draft.limits);
  const occupiedSlots = collectOccupiedBagSlots(draft);
  while (remaining > 0) {
    const nextIndex = nextFreeBagSlot(occupiedSlots, slotCap);
    if (nextIndex === null) {
      return { ok: false, error: 'inventoryFull' };
    }
    const perStack = template.stackable
      ? Math.min(remaining, template.maxStack ?? remaining)
      : 1;
    const instance: ItemInstance = {
      instanceId: instanceIdFactory(),
      ownerId: draft.characterId,
      templateId: template.id,
      location: inventoryLocation(nextIndex),
      count: perStack,
      enchantLevel: 0,
      bound: false,
      createdAtTs: now(),
    };
    draft.items[instance.instanceId] = instance;
    occupiedSlots.add(nextIndex);
    added.push(instance);
    remaining -= perStack;
  }

  const projectedWeight = totalInventoryWeight(draft, templates);
  if (projectedWeight > draft.limits.maxWeight) {
    return { ok: false, error: 'overweight' };
  }

  const violations = validateInvariants(draft, templates);
  if (violations.length > 0) {
    return { ok: false, error: 'invariantViolation' };
  }

  applyDraft(inventory, draft);
  return { ok: true, value: { added, changed } };
}

function collectOccupiedBagSlots(inventory: CharacterInventory): Set<number> {
  const used = new Set<number>();
  for (const instance of Object.values(inventory.items)) {
    if (instance.location.kind === 'inventory' && instance.location.slotIndex !== undefined) {
      used.add(instance.location.slotIndex);
    }
  }
  return used;
}

function nextFreeBagSlot(used: Set<number>, slotCap: number): number | null {
  for (let i = 0; i < slotCap; i += 1) {
    if (!used.has(i)) {
      return i;
    }
  }
  return null;
}

export function removeItems(
  inventory: CharacterInventory,
  templateId: ItemId,
  count: number,
  services: InventoryServices,
): TransactionResult<RemoveItemsOk> {
  const { templates } = getServices(services);
  const template = templates[templateId];
  if (!template) {
    return { ok: false, error: 'itemNotFound' };
  }
  if (count <= 0) {
    return { ok: true, value: { removed: 0, removedInstanceIds: [] } };
  }

  const draft = cloneInventory(inventory);
  const bagItems = listInventoryItems(draft).filter((item) => item.templateId === templateId);
  const available = bagItems.reduce((sum, item) => sum + item.count, 0);
  if (available < count) {
    return { ok: false, error: 'itemNotFound' };
  }

  let remaining = count;
  const removedInstanceIds: ItemInstanceId[] = [];
  for (const instance of bagItems) {
    if (remaining <= 0) {
      break;
    }
    if (instance.count <= remaining) {
      remaining -= instance.count;
      delete draft.items[instance.instanceId];
      removedInstanceIds.push(instance.instanceId);
    } else {
      instance.count -= remaining;
      remaining = 0;
    }
  }

  applyDraft(inventory, draft);
  return { ok: true, value: { removed: count, removedInstanceIds } };
}

export function moveSlot(
  inventory: CharacterInventory,
  instanceId: ItemInstanceId,
  targetSlotIndex: number,
): TransactionResult<{ moved: ItemInstance }> {
  const draft = cloneInventory(inventory);
  const instance = draft.items[instanceId];
  if (!instance) {
    return { ok: false, error: 'itemNotFound' };
  }
  if (instance.location.kind !== 'inventory') {
    return { ok: false, error: 'itemLocked' };
  }
  const cap = maxInventorySlotCount(draft.limits);
  if (targetSlotIndex < 0 || targetSlotIndex >= cap) {
    return { ok: false, error: 'inventoryFull' };
  }
  const occupant = Object.values(draft.items).find((other) =>
    other.instanceId !== instance.instanceId
    && other.location.kind === 'inventory'
    && other.location.slotIndex === targetSlotIndex,
  );
  const previousIndex = instance.location.slotIndex;
  instance.location = inventoryLocation(targetSlotIndex);
  if (occupant) {
    occupant.location = inventoryLocation(previousIndex);
  }
  applyDraft(inventory, draft);
  return { ok: true, value: { moved: instance } };
}

export function splitStack(
  inventory: CharacterInventory,
  instanceId: ItemInstanceId,
  amount: number,
  services: InventoryServices,
): TransactionResult<{ created: ItemInstance; remaining: ItemInstance }> {
  const { templates, instanceIdFactory, now } = getServices(services);
  const draft = cloneInventory(inventory);
  const source = draft.items[instanceId];
  if (!source) {
    return { ok: false, error: 'itemNotFound' };
  }
  if (source.location.kind !== 'inventory') {
    return { ok: false, error: 'itemLocked' };
  }
  const template = templates[source.templateId];
  if (!template?.stackable) {
    return { ok: false, error: 'notStackable' };
  }
  if (amount <= 0 || amount >= source.count) {
    return { ok: false, error: 'invalidSplitAmount' };
  }
  const cap = maxInventorySlotCount(draft.limits);
  const nextIndex = nextFreeBagSlot(collectOccupiedBagSlots(draft), cap);
  if (nextIndex === null) {
    return { ok: false, error: 'inventoryFull' };
  }
  source.count -= amount;
  const created: ItemInstance = {
    instanceId: instanceIdFactory(),
    ownerId: draft.characterId,
    templateId: source.templateId,
    location: inventoryLocation(nextIndex),
    count: amount,
    enchantLevel: 0,
    bound: source.bound,
    createdAtTs: now(),
  };
  draft.items[created.instanceId] = created;
  applyDraft(inventory, draft);
  return { ok: true, value: { created, remaining: source } };
}

export function mergeStacks(
  inventory: CharacterInventory,
  sourceId: ItemInstanceId,
  targetId: ItemInstanceId,
  services: InventoryServices,
): TransactionResult<{ target: ItemInstance }> {
  const { templates } = getServices(services);
  if (sourceId === targetId) {
    return { ok: false, error: 'templateMismatch' };
  }
  const draft = cloneInventory(inventory);
  const source = draft.items[sourceId];
  const target = draft.items[targetId];
  if (!source || !target) {
    return { ok: false, error: 'itemNotFound' };
  }
  if (source.location.kind !== 'inventory' || target.location.kind !== 'inventory') {
    return { ok: false, error: 'itemLocked' };
  }
  if (source.templateId !== target.templateId) {
    return { ok: false, error: 'templateMismatch' };
  }
  const template = templates[source.templateId];
  if (!template?.stackable) {
    return { ok: false, error: 'notStackable' };
  }
  const maxStack = template.maxStack ?? Number.MAX_SAFE_INTEGER;
  if (target.count + source.count > maxStack) {
    return { ok: false, error: 'stackOverflow' };
  }
  target.count += source.count;
  delete draft.items[source.instanceId];
  applyDraft(inventory, draft);
  return { ok: true, value: { target } };
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
