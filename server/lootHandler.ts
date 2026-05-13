import { Enemy, InventorySlot, PlayerState } from '../shared/types';
import { LOOT_TABLES } from './lootTables';
import { log, LOG_CATEGORIES } from './logger';
import { ITEMS } from '../packages/content/items.js';
import { addItemsToInventoryWithOverflow } from './inventory/inventorySlots.js';

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
  const { inventory, addedItems, overflowItems } = addItemsToInventoryWithOverflow(
    player.inventory,
    items,
    player.maxInventorySlots,
  );
  player.inventory = inventory;
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
