import type { InventorySlot } from '../protocol/messages.js';
import type { CharacterInventory, InventoryLimits } from './characterInventory.js';
import { createEmptyInventory, listInventoryItems } from './characterInventory.js';
import type { CharacterId, ItemInstance } from './itemInstance.js';

/**
 * Project the CharacterInventory aggregate into the wire `InventorySlot[]`.
 * One entry per ItemInstance currently in the bag; equipped items are
 * not included.
 *
 * §52 #11 — each slot now carries the explicit `slotIndex` from the
 * aggregate's `location.slotIndex` and the per-stack `instanceId`.
 * Pre-§52 the wire was a dense array (items sorted by slot, but with no
 * slot id), which broke the InventoryPanel when the bag was sparse
 * (e.g. after equipping the item at slot 1, the wire dropped to length 2
 * and the slot-2 item rendered at UI cell 1). Clients now position by
 * `slotIndex`; `instanceId` lets future UI distinguish two stacks of the
 * same template without a follow-up protocol change.
 */
export function flattenInventoryToSlots(inventory: CharacterInventory): InventorySlot[] {
  return listInventoryItems(inventory).map((instance) => ({
    itemId: instance.templateId,
    quantity: instance.count,
    slotIndex: instance.location.kind === 'inventory' ? instance.location.slotIndex : undefined,
    instanceId: instance.instanceId,
  }));
}

/**
 * Inverse: build a transient aggregate from a legacy `InventorySlot[]`. Used
 * during slice 3 when the server starts owning the aggregate but persistence /
 * the client still see the flat slot array.
 */
export function buildInventoryFromSlots(options: {
  characterId: CharacterId;
  slots: readonly InventorySlot[];
  limits: InventoryLimits;
  now?: number;
  instanceIdFactory: () => string;
}): CharacterInventory {
  const { characterId, slots, limits, instanceIdFactory } = options;
  const now = options.now ?? Date.now();
  const aggregate = createEmptyInventory(characterId, limits);

  slots.forEach((slot, slotIndex) => {
    const instance: ItemInstance = {
      instanceId: instanceIdFactory(),
      ownerId: characterId,
      templateId: slot.itemId,
      location: { kind: 'inventory', slotIndex },
      count: slot.quantity,
      enchantLevel: 0,
      bound: false,
      createdAtTs: now,
    };
    aggregate.items[instance.instanceId] = instance;
  });

  return aggregate;
}
