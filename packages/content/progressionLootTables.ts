import type { LootTable } from './lootTables.js';

/**
 * Loot tables for quest-specific high-level mobs added to existing large
 * biome zones. Kept out of lootTables.ts because that catalog is already
 * near the maintainability ceiling.
 */
export const PROGRESSION_LOOT_TABLES: Record<string, LootTable> = {
  cinder_sentinel_loot: {
    id: 'cinder_sentinel_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 1, max: 3 }, chance: 0.7 },
      { itemId: 'fire_gem', quantity: { min: 1, max: 3 }, chance: 0.8 },
      { itemId: 'greater_health_potion', quantity: { min: 1, max: 1 }, chance: 0.35 },
    ],
  },
  sunscale_drake_loot: {
    id: 'sunscale_drake_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 2, max: 5 }, chance: 0.85 },
      { itemId: 'dragon_scale', quantity: { min: 1, max: 2 }, chance: 0.65 },
      { itemId: 'fire_gem', quantity: { min: 1, max: 2 }, chance: 0.55 },
    ],
  },
  starglass_weaver_loot: {
    id: 'starglass_weaver_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 2, max: 5 }, chance: 0.85 },
      { itemId: 'star_essence', quantity: { min: 1, max: 2 }, chance: 0.75 },
      { itemId: 'mana_potion', quantity: { min: 1, max: 2 }, chance: 0.45 },
    ],
  },
  lumen_warden_loot: {
    id: 'lumen_warden_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 3, max: 7 }, chance: 0.9 },
      { itemId: 'celestial_dust', quantity: { min: 2, max: 4 }, chance: 0.75 },
      { itemId: 'star_essence', quantity: { min: 1, max: 2 }, chance: 0.5 },
    ],
  },
  bog_reaver_loot: {
    id: 'bog_reaver_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 2, max: 6 }, chance: 0.85 },
      { itemId: 'void_fragment', quantity: { min: 1, max: 3 }, chance: 0.75 },
      { itemId: 'dark_essence', quantity: { min: 1, max: 3 }, chance: 0.55 },
    ],
  },
  lantern_wraith_loot: {
    id: 'lantern_wraith_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 2, max: 6 }, chance: 0.8 },
      { itemId: 'abyssal_pearl', quantity: { min: 1, max: 2 }, chance: 0.45 },
      { itemId: 'mana_potion', quantity: { min: 1, max: 2 }, chance: 0.55 },
    ],
  },
  glass_harrier_loot: {
    id: 'glass_harrier_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 3, max: 8 }, chance: 0.9 },
      { itemId: 'temporal_fragment', quantity: { min: 1, max: 3 }, chance: 0.75 },
      { itemId: 'temporal_shard', quantity: { min: 1, max: 1 }, chance: 0.45 },
    ],
  },
  rift_mender_loot: {
    id: 'rift_mender_loot',
    drops: [
      { itemId: 'platinum_coin', quantity: { min: 4, max: 9 }, chance: 0.95 },
      { itemId: 'temporal_shard', quantity: { min: 1, max: 3 }, chance: 0.7 },
      { itemId: 'greater_health_potion', quantity: { min: 1, max: 2 }, chance: 0.45 },
    ],
  },
  road_thornback_loot: {
    id: 'road_thornback_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 18, max: 34 }, chance: 0.85 },
      { itemId: 'dark_essence', quantity: { min: 1, max: 3 }, chance: 0.45 },
      { itemId: 'greater_health_potion', quantity: { min: 1, max: 1 }, chance: 0.25 },
    ],
  },
  ash_dust_runner_loot: {
    id: 'ash_dust_runner_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 24, max: 42 }, chance: 0.85 },
      { itemId: 'fire_gem', quantity: { min: 1, max: 2 }, chance: 0.55 },
      { itemId: 'mana_potion', quantity: { min: 1, max: 1 }, chance: 0.35 },
    ],
  },
  brightglass_mote_loot: {
    id: 'brightglass_mote_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 30, max: 52 }, chance: 0.9 },
      { itemId: 'crystal_shard', quantity: { min: 1, max: 3 }, chance: 0.7 },
      { itemId: 'mana_potion', quantity: { min: 1, max: 2 }, chance: 0.4 },
    ],
  },
  surveybreaker_golem_loot: {
    id: 'surveybreaker_golem_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 42, max: 70 }, chance: 0.9 },
      { itemId: 'crystal_shard', quantity: { min: 2, max: 4 }, chance: 0.75 },
      { itemId: 'greater_health_potion', quantity: { min: 1, max: 1 }, chance: 0.35 },
    ],
  },
  moonroad_prowler_loot: {
    id: 'moonroad_prowler_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 38, max: 66 }, chance: 0.9 },
      { itemId: 'ice_crystal', quantity: { min: 1, max: 2 }, chance: 0.55 },
      { itemId: 'health_potion', quantity: { min: 1, max: 2 }, chance: 0.45 },
    ],
  },
  coldstar_acolyte_loot: {
    id: 'coldstar_acolyte_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 45, max: 76 }, chance: 0.9 },
      { itemId: 'star_essence', quantity: { min: 1, max: 2 }, chance: 0.6 },
      { itemId: 'mana_potion', quantity: { min: 1, max: 2 }, chance: 0.45 },
    ],
  },
  horizon_jackal_loot: {
    id: 'horizon_jackal_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 52, max: 88 }, chance: 0.9 },
      { itemId: 'dragon_scale', quantity: { min: 1, max: 1 }, chance: 0.25 },
      { itemId: 'greater_health_potion', quantity: { min: 1, max: 1 }, chance: 0.35 },
    ],
  },
  rift_surveyor_loot: {
    id: 'rift_surveyor_loot',
    drops: [
      { itemId: 'gold_coin', quantity: { min: 64, max: 100 }, chance: 0.9 },
      { itemId: 'temporal_fragment', quantity: { min: 1, max: 3 }, chance: 0.65 },
      { itemId: 'temporal_shard', quantity: { min: 1, max: 1 }, chance: 0.25 },
    ],
  },
};
