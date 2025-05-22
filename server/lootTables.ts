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
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.15, // 15% chance
      },
      {
        itemId: 'worn_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.05, // 5% chance
      },
    ],
  },
  'skeleton_loot': {
    id: 'skeleton_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 2, max: 6 },
        chance: 0.9, // 90% chance
      },
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.2, // 20% chance
      },
    ],
  },
  'spider_loot': {
    id: 'spider_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 4 },
        chance: 0.75, // 75% chance
      },
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.25, // 25% chance
      },
    ],
  },
  'boss_loot': {
    id: 'boss_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 10, max: 30 },
        chance: 1.0, // Always drops
      },
      {
        itemId: 'health_potion',
        quantity: { min: 2, max: 5 },
        chance: 0.75, // 75% chance
      },
      {
        itemId: 'worn_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.3, // 30% chance
      },
    ],
  },
  // More loot tables can be added for other enemy types
};
