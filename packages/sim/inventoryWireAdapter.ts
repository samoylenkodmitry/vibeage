import type { InventorySlot } from '../protocol/messages.js';
import type { CharacterInventory, InventoryLimits } from './characterInventory.js';
import { createEmptyInventory, listInventoryItems } from './characterInventory.js';
import type { CharacterId, ItemInstance } from './itemInstance.js';

/**
 * Compatibility shim: project the new CharacterInventory aggregate back into
 * the legacy `InventorySlot[]` wire shape so existing protocol consumers
 * continue working until slice 4 introduces the dedicated equipment messages.
 *
 * One InventorySlot per ItemInstance currently in the bag. Equipped items
 * are not included in the bag view (matching today's behaviour).
 */
export function flattenInventoryToSlots(inventory: CharacterInventory): InventorySlot[] {
  return listInventoryItems(inventory).map((instance) => ({
    itemId: instance.templateId,
    quantity: instance.count,
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
