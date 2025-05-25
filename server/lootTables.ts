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
  'troll_loot': {
    id: 'troll_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 5, max: 15 },
        chance: 0.9,
      },
      {
        itemId: 'troll_bone',
        quantity: { min: 1, max: 2 },
        chance: 0.7,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.3,
      },
    ],
  },
  'orc_loot': {
    id: 'orc_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 3, max: 8 },
        chance: 0.85,
      },
      {
        itemId: 'orc_fang',
        quantity: { min: 1, max: 3 },
        chance: 0.6,
      },
      {
        itemId: 'worn_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.15,
      },
    ],
  },
  'wraith_loot': {
    id: 'wraith_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 8, max: 20 },
        chance: 0.8,
      },
      {
        itemId: 'dark_essence',
        quantity: { min: 1, max: 2 },
        chance: 0.5,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.4,
      },
    ],
  },
  'necromancer_loot': {
    id: 'necromancer_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 15, max: 35 },
        chance: 1.0,
      },
      {
        itemId: 'dark_essence',
        quantity: { min: 2, max: 4 },
        chance: 0.8,
      },
      {
        itemId: 'crystal_staff',
        quantity: { min: 1, max: 1 },
        chance: 0.25,
      },
      {
        itemId: 'elixir_of_strength',
        quantity: { min: 1, max: 2 },
        chance: 0.4,
      },
    ],
  },
  'wyvern_loot': {
    id: 'wyvern_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 20, max: 40 },
        chance: 0.95,
      },
      {
        itemId: 'dragon_scale',
        quantity: { min: 1, max: 2 },
        chance: 0.6,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 3 },
        chance: 0.5,
      },
    ],
  },
  'drake_loot': {
    id: 'drake_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 15, max: 30 },
        chance: 0.9,
      },
      {
        itemId: 'dragon_scale',
        quantity: { min: 1, max: 1 },
        chance: 0.4,
      },
      {
        itemId: 'flame_blade',
        quantity: { min: 1, max: 1 },
        chance: 0.1,
      },
    ],
  },
  'dragon_loot': {
    id: 'dragon_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 5, max: 15 },
        chance: 1.0,
      },
      {
        itemId: 'dragon_scale',
        quantity: { min: 3, max: 6 },
        chance: 0.9,
      },
      {
        itemId: 'flame_blade',
        quantity: { min: 1, max: 1 },
        chance: 0.4,
      },
      {
        itemId: 'elixir_of_strength',
        quantity: { min: 2, max: 4 },
        chance: 0.7,
      },
    ],
  },
  'shadowbeast_loot': {
    id: 'shadowbeast_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 12, max: 25 },
        chance: 0.85,
      },
      {
        itemId: 'dark_essence',
        quantity: { min: 2, max: 3 },
        chance: 0.7,
      },
      {
        itemId: 'void_dagger',
        quantity: { min: 1, max: 1 },
        chance: 0.15,
      },
    ],
  },
  'darkstalker_loot': {
    id: 'darkstalker_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 18, max: 35 },
        chance: 0.9,
      },
      {
        itemId: 'dark_essence',
        quantity: { min: 1, max: 3 },
        chance: 0.6,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.5,
      },
    ],
  },
  'voidwalker_loot': {
    id: 'voidwalker_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 1, max: 3 },
        chance: 0.8,
      },
      {
        itemId: 'void_fragment',
        quantity: { min: 1, max: 2 },
        chance: 0.5,
      },
      {
        itemId: 'void_dagger',
        quantity: { min: 1, max: 1 },
        chance: 0.2,
      },
    ],
  },
  'crystal_golem_loot': {
    id: 'crystal_golem_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 15, max: 30 },
        chance: 0.95,
      },
      {
        itemId: 'crystal_shard',
        quantity: { min: 2, max: 4 },
        chance: 0.8,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.4,
      },
    ],
  },
  'crystal_elemental_loot': {
    id: 'crystal_elemental_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 10, max: 22 },
        chance: 0.9,
      },
      {
        itemId: 'crystal_shard',
        quantity: { min: 1, max: 3 },
        chance: 0.7,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.6,
      },
    ],
  },
  'crystal_guardian_loot': {
    id: 'crystal_guardian_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 2, max: 5 },
        chance: 1.0,
      },
      {
        itemId: 'crystal_shard',
        quantity: { min: 3, max: 6 },
        chance: 0.9,
      },
      {
        itemId: 'crystal_staff',
        quantity: { min: 1, max: 1 },
        chance: 0.3,
      },
    ],
  },
  // New zone mob loot tables
  'fire_elemental_loot': {
    id: 'fire_elemental_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 18, max: 35 },
        chance: 0.9,
      },
      {
        itemId: 'fire_gem',
        quantity: { min: 1, max: 3 },
        chance: 0.7,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.3,
      },
    ],
  },
  'lava_golem_loot': {
    id: 'lava_golem_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 1, max: 4 },
        chance: 0.8,
      },
      {
        itemId: 'fire_gem',
        quantity: { min: 2, max: 4 },
        chance: 0.8,
      },
      {
        itemId: 'flame_blade',
        quantity: { min: 1, max: 1 },
        chance: 0.2,
      },
    ],
  },
  'flame_wraith_loot': {
    id: 'flame_wraith_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 25, max: 45 },
        chance: 0.95,
      },
      {
        itemId: 'fire_gem',
        quantity: { min: 1, max: 2 },
        chance: 0.6,
      },
      {
        itemId: 'elixir_of_strength',
        quantity: { min: 1, max: 2 },
        chance: 0.4,
      },
    ],
  },
  'ice_giant_loot': {
    id: 'ice_giant_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 3, max: 8 },
        chance: 1.0,
      },
      {
        itemId: 'ice_crystal',
        quantity: { min: 2, max: 5 },
        chance: 0.9,
      },
      {
        itemId: 'frost_hammer',
        quantity: { min: 1, max: 1 },
        chance: 0.25,
      },
    ],
  },
  'frost_wolf_loot': {
    id: 'frost_wolf_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 8, max: 18 },
        chance: 0.8,
      },
      {
        itemId: 'wolf_pelt',
        quantity: { min: 1, max: 2 },
        chance: 0.6,
      },
      {
        itemId: 'ice_crystal',
        quantity: { min: 1, max: 1 },
        chance: 0.4,
      },
    ],
  },
  'ice_elemental_loot': {
    id: 'ice_elemental_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 15, max: 30 },
        chance: 0.9,
      },
      {
        itemId: 'ice_crystal',
        quantity: { min: 1, max: 3 },
        chance: 0.7,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.5,
      },
    ],
  },
  'spirit_guardian_loot': {
    id: 'spirit_guardian_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 2, max: 6 },
        chance: 0.9,
      },
      {
        itemId: 'ethereal_dust',
        quantity: { min: 3, max: 6 },
        chance: 0.8,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 3 },
        chance: 0.6,
      },
    ],
  },
  'ethereal_sprite_loot': {
    id: 'ethereal_sprite_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 10, max: 25 },
        chance: 0.8,
      },
      {
        itemId: 'ethereal_dust',
        quantity: { min: 1, max: 4 },
        chance: 0.7,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 1 },
        chance: 0.5,
      },
    ],
  },
  'ancient_treant_loot': {
    id: 'ancient_treant_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 4, max: 10 },
        chance: 1.0,
      },
      {
        itemId: 'ethereal_dust',
        quantity: { min: 5, max: 10 },
        chance: 0.9,
      },
      {
        itemId: 'elixir_of_strength',
        quantity: { min: 2, max: 4 },
        chance: 0.7,
      },
    ],
  },
  'deep_leviathan_loot': {
    id: 'deep_leviathan_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 10, max: 25 },
        chance: 1.0,
      },
      {
        itemId: 'void_fragment',
        quantity: { min: 2, max: 4 },
        chance: 0.8,
      },
      {
        itemId: 'void_dagger',
        quantity: { min: 1, max: 1 },
        chance: 0.4,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 3, max: 6 },
        chance: 0.8,
      },
    ],
  },
  'tentacle_horror_loot': {
    id: 'tentacle_horror_loot',
    drops: [
      {
        itemId: 'gold_coin',
        quantity: { min: 20, max: 40 },
        chance: 0.9,
      },
      {
        itemId: 'void_fragment',
        quantity: { min: 1, max: 2 },
        chance: 0.6,
      },
      {
        itemId: 'dark_essence',
        quantity: { min: 2, max: 4 },
        chance: 0.7,
      },
    ],
  },
  'void_spawner_loot': {
    id: 'void_spawner_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 1, max: 4 },
        chance: 0.8,
      },
      {
        itemId: 'void_fragment',
        quantity: { min: 1, max: 3 },
        chance: 0.7,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.5,
      },
    ],
  },
  'celestial_guardian_loot': {
    id: 'celestial_guardian_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 8, max: 20 },
        chance: 1.0,
      },
      {
        itemId: 'star_essence',
        quantity: { min: 1, max: 2 },
        chance: 0.7,
      },
      {
        itemId: 'celestial_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.2,
      },
    ],
  },
  'star_weaver_loot': {
    id: 'star_weaver_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 5, max: 15 },
        chance: 0.9,
      },
      {
        itemId: 'star_essence',
        quantity: { min: 1, max: 1 },
        chance: 0.6,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 3 },
        chance: 0.5,
      },
    ],
  },
  'radiant_seraph_loot': {
    id: 'radiant_seraph_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 10, max: 30 },
        chance: 1.0,
      },
      {
        itemId: 'star_essence',
        quantity: { min: 1, max: 3 },
        chance: 0.8,
      },
      {
        itemId: 'celestial_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.3,
      },
      {
        itemId: 'elixir_of_strength',
        quantity: { min: 2, max: 4 },
        chance: 0.7,
      },
    ],
  },
  'time_wraith_loot': {
    id: 'time_wraith_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 15, max: 35 },
        chance: 0.95,
      },
      {
        itemId: 'temporal_shard',
        quantity: { min: 1, max: 2 },
        chance: 0.6,
      },
      {
        itemId: 'mana_potion',
        quantity: { min: 2, max: 4 },
        chance: 0.7,
      },
    ],
  },
  'chrono_stalker_loot': {
    id: 'chrono_stalker_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 12, max: 28 },
        chance: 0.9,
      },
      {
        itemId: 'temporal_shard',
        quantity: { min: 1, max: 1 },
        chance: 0.5,
      },
      {
        itemId: 'greater_health_potion',
        quantity: { min: 1, max: 2 },
        chance: 0.4,
      },
    ],
  },
  'temporal_overlord_loot': {
    id: 'temporal_overlord_loot',
    drops: [
      {
        itemId: 'platinum_coin',
        quantity: { min: 25, max: 50 },
        chance: 1.0,
      },
      {
        itemId: 'temporal_shard',
        quantity: { min: 2, max: 4 },
        chance: 0.9,
      },
      {
        itemId: 'celestial_sword',
        quantity: { min: 1, max: 1 },
        chance: 0.4,
      },
      {
        itemId: 'elixir_of_strength',
        quantity: { min: 3, max: 6 },
        chance: 0.8,
      },
    ],
  },
};
