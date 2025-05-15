// filepath: /home/s/develop/projects/vibe/1/shared/items.ts
export type ItemId = string;

export interface Item {
  id: ItemId;
  name: string;
  description: string;
  icon: string;
  stackable: boolean;
  maxStack?: number;
  type: 'weapon' | 'armor' | 'consumable' | 'material' | 'currency';
  // Additional properties for specific item types
  attackPower?: number;
  defenseValue?: number;
  healAmount?: number;
}

export const ITEMS: Record<ItemId, Item> = {
  'gold_coin': {
    id: 'gold_coin',
    name: 'Gold Coin',
    description: 'Standard currency used throughout the realm.',
    icon: 'gold_coin.svg',
    stackable: true,
    maxStack: 9999,
    type: 'currency',
  },
  'health_potion': {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 50 health points when consumed.',
    icon: 'health_potion.svg',
    stackable: true,
    maxStack: 20,
    type: 'consumable',
    healAmount: 50,
  },
  'goblin_ear': {
    id: 'goblin_ear',
    name: 'Goblin Ear',
    description: 'A grotesque trophy from a fallen goblin. Some alchemists might find it useful.',
    icon: 'goblin_ear.svg',
    stackable: true,
    maxStack: 50,
    type: 'material',
  },
  'worn_sword': {
    id: 'worn_sword',
    name: 'Worn Sword',
    description: 'A basic sword showing signs of wear and tear. Still sharp enough to be useful.',
    icon: 'worn_sword.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 5,
  },
};
