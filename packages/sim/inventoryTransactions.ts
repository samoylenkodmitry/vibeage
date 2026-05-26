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

  // §52 follow-up — fold any same-template stacks left over from
  // older drops into one (or as few as possible). Without this, a
  // bag could legitimately end up with [5×potion, 15×potion] in
  // two slots because each addItems call only stops as soon as
  // `remaining` hits zero, leaving the existing stack short of
  // maxStack. User-visible bug; consolidation runs every transaction
  // so the invariant \"at most one non-full stack per (templateId,
  // enchant, bound)\" holds everywhere.
  consolidateStacks(draft, templates);

  const violations = validateInvariants(draft, templates);
  if (violations.length > 0) {
    return { ok: false, error: 'invariantViolation' };
  }

  applyDraft(inventory, draft);
  return { ok: true, value: { added, changed } };
}

/**
 * Merge multiple bag stacks of the same `(templateId, enchantLevel,
 * bound)` into the fewest stacks possible. Items are kept at the
 * LOWER slot indices first — predictable layout, fewer surprises for
 * the player. Non-stackable templates are left alone. Single source
 * of truth for the \"one stack per item kind\" invariant.
 */
export function consolidateStacks(
  inventory: CharacterInventory,
  templates: Record<string, Item>,
): void {
  type Group = { templateId: string; enchantLevel: number; bound: boolean };
  // Coalesce undefined → defaults so legacy instances (persisted before these
  // fields existed) group with freshly-created ones instead of forming a
  // separate, never-merging bucket.
  const key = (g: Group) => `${g.templateId}|${g.enchantLevel ?? 0}|${g.bound ? 1 : 0}`;
  const groups = new Map<string, ItemInstance[]>();
  for (const instance of Object.values(inventory.items)) {
    if (instance.location.kind !== 'inventory') continue;
    const template = templates[instance.templateId];
    if (!template?.stackable) continue;
    const k = key({ templateId: instance.templateId, enchantLevel: instance.enchantLevel ?? 0, bound: instance.bound ?? false });
    const bucket = groups.get(k) ?? [];
    bucket.push(instance);
    groups.set(k, bucket);
  }
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => {
      const ai = a.location.kind === 'inventory' ? (a.location.slotIndex ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const bi = b.location.kind === 'inventory' ? (b.location.slotIndex ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
    const maxStack = templates[bucket[0].templateId]?.maxStack ?? Number.MAX_SAFE_INTEGER;
    let target = 0;
    for (let i = 1; i < bucket.length; i += 1) {
      const src = bucket[i];
      while (target < i && bucket[target].count >= maxStack) target += 1;
      if (target >= i) break;
      const room = maxStack - bucket[target].count;
      const moved = Math.min(room, src.count);
      bucket[target].count += moved;
      src.count -= moved;
      if (src.count === 0) delete inventory.items[src.instanceId];
    }
  }
}

/**
 * Repair an aggregate into a state that satisfies every invariant. Used at the
 * persistence boundary so legacy or hand-edited data can never inject an
 * invariant-violating aggregate into the live game (which would make every
 * subsequent validate-before-apply transaction fail). Mutates in place.
 *
 * Steps: coerce per-instance fields (enchant/bound/count) + drop destroyed
 * items; merge partial stacks; split stacks that now exceed maxStack (e.g.
 * after a content rebalance lowered it); re-slot any item whose bag slot is
 * missing, duplicated, or out of range; drop overflow beyond the slot cap.
 */
export function normalizeInventory(inventory: CharacterInventory, services: InventoryServices): void {
  const { templates, instanceIdFactory } = getServices(services);

  for (const [id, instance] of Object.entries(inventory.items)) {
    // Corrupt/legacy rows may lack a location; default it so the later
    // location.kind reads (and re-slotting) can't throw.
    if (!instance.location) {
      instance.location = inventoryLocation(undefined);
    }
    if (instance.location.kind === 'destroyed') {
      delete inventory.items[id];
      continue;
    }
    instance.enchantLevel = Number.isFinite(instance.enchantLevel) ? instance.enchantLevel : 0;
    instance.bound = Boolean(instance.bound);
    const count = Math.floor(Number(instance.count));
    instance.count = Number.isFinite(count) && count > 0 ? count : 1;
    const template = templates[instance.templateId];
    if (template && !template.stackable) instance.count = 1;
  }

  consolidateStacks(inventory, templates);

  // Split anything still over maxStack into full stacks plus the remainder.
  for (const instance of [...Object.values(inventory.items)]) {
    if (instance.location.kind !== 'inventory') continue;
    const template = templates[instance.templateId];
    if (!template?.stackable) continue;
    // Clamp to ≥1: a misconfigured maxStack of 0/negative would make the
    // split loop never terminate (DoS).
    const maxStack = Math.max(1, template.maxStack ?? Number.MAX_SAFE_INTEGER);
    while (instance.count > maxStack) {
      const extra: ItemInstance = {
        ...instance,
        instanceId: instanceIdFactory(),
        location: inventoryLocation(undefined),
        count: maxStack,
      };
      inventory.items[extra.instanceId] = extra;
      instance.count -= maxStack;
    }
  }

  // Re-slot: keep valid, unique, in-range slots; reassign everything else to
  // the lowest free slot; drop items that overflow the cap (corrupt data).
  const cap = maxInventorySlotCount(inventory.limits);
  const used = new Set<number>();
  const needsSlot: ItemInstance[] = [];
  for (const instance of Object.values(inventory.items)) {
    if (instance.location.kind !== 'inventory') continue;
    const slot = instance.location.slotIndex;
    if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < cap && !used.has(slot)) {
      used.add(slot);
    } else {
      needsSlot.push(instance);
    }
  }
  let next = 0;
  for (const instance of needsSlot) {
    while (next < cap && used.has(next)) next += 1;
    if (next >= cap) {
      delete inventory.items[instance.instanceId];
      continue;
    }
    instance.location = inventoryLocation(next);
    used.add(next);
  }
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
  // We deliberately do NOT verify `templateId` against the template
  // registry. Orphan instances (template retired in a later content
  // release) are legitimate player data — refusing to remove them
  // by id leaves the player unable to destroy them and free the
  // slot. The bag-items check below is the only validity gate: if
  // the bag holds enough of the id, remove it; otherwise it's a
  // genuine "not in bag" miss. `services` is still used for the
  // validate-before-apply templates below.
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

  if (validateInvariants(draft, getServices(services).templates).length > 0) {
    return { ok: false, error: 'invariantViolation' };
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
  if (validateInvariants(draft).length > 0) {
    return { ok: false, error: 'invariantViolation' };
  }
  applyDraft(inventory, draft);
  return { ok: true, value: { moved: instance } };
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
  if (validateInvariants(draft, templates).length > 0) {
    return { ok: false, error: 'invariantViolation' };
  }
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
