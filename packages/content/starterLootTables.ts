import type { LootTable } from './lootTables.js';

export const STARTER_LOOT_TABLES: Record<string, LootTable> = {
  goblin_loot: {
    id: 'goblin_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 5 },
        chance: 1,
      },
      {
        itemId: 'goblin_ear',
        quantity: { min: 1, max: 1 },
        chance: 0.5,
      },
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.1,
      },
    ],
  },
  wolf_loot: {
    id: 'wolf_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 3 },
        chance: 0.8,
      },
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.15,
      },
      {
        itemId: 'worn_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.05,
      },
    ],
  },
  skeleton_loot: {
    id: 'skeleton_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 2, max: 6 },
        chance: 0.9,
      },
      {
        itemId: 'health_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.2,
      },
    ],
  },
  slime_loot: {
    id: 'slime_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 2 },
        chance: 0.7,
      },
      {
        itemId: 'slime_jelly',
        quantity: { min: 1, max: 2 },
        chance: 0.65,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.08,
      },
    ],
  },
  meadow_sprite_loot: {
    id: 'meadow_sprite_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 1, max: 3 },
        chance: 0.75,
      },
      {
        itemId: 'sprite_glow',
        quantity: { min: 1, max: 1 },
        chance: 0.55,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.12,
      },
    ],
  },
};
