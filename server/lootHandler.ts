import { Enemy, InventorySlot, PlayerState } from '../shared/types';
import { LOOT_TABLES } from './lootTables';
import { log, LOG_CATEGORIES } from './logger';
import { ITEMS } from '../shared/items';

/**
 * Generates loot from an enemy's loot table
 * @param lootTableId The ID of the loot table to use
 * @returns Array of inventory slots containing loot
 */
export function generateLoot(lootTableId: string): InventorySlot[] {
  const lootTable = LOOT_TABLES[lootTableId];
  if (!lootTable) {
    log(LOG_CATEGORIES.SYSTEM, `Loot table ${lootTableId} not found`);
    return [];
  }

  const generatedLoot: InventorySlot[] = [];

  // Process each potential drop in the loot table
  lootTable.drops.forEach(drop => {
    // Roll for chance
    const roll = Math.random();
    if (roll <= drop.chance) {
      // Determine quantity
      const quantity = Math.floor(
        drop.quantity.min + Math.random() * (drop.quantity.max - drop.quantity.min + 1)
      );
      
      if (quantity > 0) {
        generatedLoot.push({
          itemId: drop.itemId,
          quantity
        });
      }
    }
  });

  return generatedLoot;
}

/**
 * Adds items to a player's inventory, handling stacking and inventory limits
 * @param player The player to add items to
 * @param items The items to add
 * @returns Object containing successfully added items and overflow items
 */
export function addItemsToInventory(
  player: PlayerState, 
  items: InventorySlot[]
): { addedItems: InventorySlot[], overflowItems: InventorySlot[] } {
  const addedItems: InventorySlot[] = [];
  const overflowItems: InventorySlot[] = [];

  // Process each item
  items.forEach(item => {
    let remainingQuantity = item.quantity;
    const { itemId } = item;

    // First try to merge with existing stacks of the same item
    // Check if the item is stackable
    const itemDef = ITEMS[itemId];
    const isStackable = itemDef?.stackable ?? true; // Default to stackable if definition not found
    const maxStack = itemDef?.maxStack ?? 999; // Default max stack
    
    if (isStackable) {
      // Find existing stacks of this item that aren't full
      for (let i = 0; i < player.inventory.length && remainingQuantity > 0; i++) {
        const slot = player.inventory[i];
        
        if (slot.itemId === itemId && slot.quantity < maxStack) {
          // Calculate how much we can add to this stack
          const spaceInStack = maxStack - slot.quantity;
          const amountToAdd = Math.min(spaceInStack, remainingQuantity);
          
          // Add to existing stack
          player.inventory[i].quantity += amountToAdd;
          remainingQuantity -= amountToAdd;
          
          // Add to addedItems for tracking
          addedItems.push({
            itemId,
            quantity: amountToAdd
          });
        }
      }
    }
    
    // If we still have items to add and item is not stackable or we need a new stack
    while (remainingQuantity > 0) {
      // Check if we have space for a new slot
      if (player.inventory.length < player.maxInventorySlots) {
        // How much to add in this new slot
        const amountForNewSlot = isStackable ? Math.min(remainingQuantity, maxStack) : 1;
        
        // Add to a new slot
        player.inventory.push({
          itemId,
          quantity: amountForNewSlot
        });
        
        // Add to addedItems for tracking
        addedItems.push({
          itemId,
          quantity: amountForNewSlot
        });
        
        remainingQuantity -= amountForNewSlot;
      } else {
        // No more inventory space
        break;
      }
    }
    
    // If we still have items, they go to overflow
    if (remainingQuantity > 0) {
      overflowItems.push({
        itemId,
        quantity: remainingQuantity
      });
    }
  });
  
  return { addedItems, overflowItems };
}

/**
 * Handles an enemy death by generating and awarding loot to the killer
 * @param enemy The enemy that died
 * @param killerId The ID of the player who killed the enemy
 * @param state The game state object
 * @returns Inventory update and loot acquired info if items were added
 */
export function handleEnemyLoot(
  enemy: Enemy, 
  killerId: string, 
  state: any
): { 
  inventoryUpdate?: { playerId: string, inventory: InventorySlot[], maxInventorySlots: number },
  lootAcquired?: { playerId: string, items: InventorySlot[], sourceEnemyName: string }
} {
  // Only process if the enemy has a loot table and there's a valid killer
  if (!enemy.lootTableId || !killerId) {
    return {};
  }
  
  const killer = state.players[killerId];
  if (!killer) {
    return {};
  }
  
  // Generate loot from the enemy's loot table
  const loot = generateLoot(enemy.lootTableId);
  if (!loot.length) {
    return {}; // No loot generated
  }
  
  // Add the loot to the killer's inventory
  const { addedItems, overflowItems } = addItemsToInventory(killer, loot);
  
  // Log any overflow items
  if (overflowItems.length > 0) {
    const overflowItemNames = overflowItems
      .map(item => `${item.quantity}x ${ITEMS[item.itemId]?.name || item.itemId}`)
      .join(', ');
    
    log(LOG_CATEGORIES.PLAYER, 
      `Player ${killer.name} inventory full - Dropped: ${overflowItemNames}`);
  }
  
  // Prepare return data for sending messages
  const result: any = {};
  
  // Always return inventory update
  result.inventoryUpdate = {
    playerId: killerId,
    inventory: killer.inventory,
    maxInventorySlots: killer.maxInventorySlots
  };
  
  // If items were successfully added, include loot acquired data
  if (addedItems.length > 0) {
    result.lootAcquired = {
      playerId: killerId,
      items: addedItems,
      sourceEnemyName: enemy.name
    };
  }
  
  return result;
}
