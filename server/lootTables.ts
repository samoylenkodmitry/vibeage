import { ItemId } from '../shared/items';

export interface LootDrop {
  itemId: ItemId;
  quantity: { min: number; max: number };
  chance: number; // 0-1 probability
}

export interface LootTable {
  id: string;
  drops: LootDrop[];
}

export const LOOT_TABLES: Record<string, LootTable> = {
  'goblin_loot': {
    id: 'goblin_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 5 },
        chance: 1.0, // Always drops
      },
      {
        itemId: 'goblin_ear',
        quantity: { min: 1, max: 1 },
        chance: 0.5, // 50% chance
      },
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.1, // 10% chance
      },
    ],
  },
  'wolf_loot': {
    id: 'wolf_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 3 },
        chance: 0.8, // 80% chance
      },
      // Other wolf drops can be added here
    ],
  },
  // More loot tables can be added for other enemy types
};
