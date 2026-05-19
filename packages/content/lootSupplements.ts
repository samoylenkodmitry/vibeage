import type { LootDrop } from './lootTables.js';

/**
 * PR HH — extra drops appended to existing mob/boss loot tables.
 * Lives separately from lootTables.ts so the validator-driven
 * obtainability fixes for biome materials and rare endgame weapons
 * don't push lootTables.ts past the 700-line maintainability cap.
 *
 * Each key matches a loot-table id defined in lootTables.ts; the
 * spread happens at the LOOT_TABLES seam there. Adding a new entry
 * here automatically reaches both the runtime drop pipeline and the
 * wiki "Dropped by" cross-link.
 */
export const SUPPLEMENTAL_DROPS: Record<string, readonly LootDrop[]> = {
  // Materials by biome affinity — fills the obtainability gap for
  // every "essence / shard / petal / fragment" the wiki lists.
  ice_giant_loot: [
    { itemId: 'ice_essence', quantity: { min: 1, max: 3 }, chance: 0.5 },
    { itemId: 'frost_diamond', quantity: { min: 1, max: 1 }, chance: 0.1 },
    { itemId: 'frost_blade', quantity: { min: 1, max: 1 }, chance: 0.02 },
  ],
  frost_wolf_loot: [
    { itemId: 'ice_essence', quantity: { min: 1, max: 2 }, chance: 0.35 },
  ],
  fire_elemental_loot: [
    { itemId: 'volcanic_rock', quantity: { min: 1, max: 3 }, chance: 0.4 },
  ],
  lava_golem_loot: [
    { itemId: 'volcanic_rock', quantity: { min: 1, max: 3 }, chance: 0.5 },
    { itemId: 'flame_heart', quantity: { min: 1, max: 1 }, chance: 0.1 },
    { itemId: 'flame_sword', quantity: { min: 1, max: 1 }, chance: 0.02 },
  ],
  ethereal_sprite_loot: [
    { itemId: 'ethereal_petal', quantity: { min: 1, max: 3 }, chance: 0.4 },
  ],
  ancient_treant_loot: [
    { itemId: 'ethereal_petal', quantity: { min: 1, max: 4 }, chance: 0.55 },
  ],
  shadowbeast_loot: [
    { itemId: 'shadow_essence', quantity: { min: 1, max: 2 }, chance: 0.4 },
  ],
  darkstalker_loot: [
    { itemId: 'shadow_essence', quantity: { min: 1, max: 3 }, chance: 0.45 },
  ],
  voidwalker_loot: [
    { itemId: 'void_crystal', quantity: { min: 1, max: 1 }, chance: 0.25 },
    { itemId: 'shadow_dagger', quantity: { min: 1, max: 1 }, chance: 0.02 },
  ],
  time_wraith_loot: [
    { itemId: 'temporal_fragment', quantity: { min: 1, max: 2 }, chance: 0.4 },
  ],
  chrono_stalker_loot: [
    { itemId: 'temporal_fragment', quantity: { min: 1, max: 3 }, chance: 0.5 },
  ],
  temporal_overlord_loot: [
    { itemId: 'temporal_orb', quantity: { min: 1, max: 1 }, chance: 0.02 },
  ],
  celestial_guardian_loot: [
    { itemId: 'celestial_dust', quantity: { min: 1, max: 3 }, chance: 0.45 },
  ],
  star_weaver_loot: [
    { itemId: 'celestial_dust', quantity: { min: 1, max: 4 }, chance: 0.55 },
  ],
  radiant_seraph_loot: [
    { itemId: 'celestial_staff', quantity: { min: 1, max: 1 }, chance: 0.02 },
  ],
  tentacle_horror_loot: [
    { itemId: 'abyssal_pearl', quantity: { min: 1, max: 2 }, chance: 0.3 },
    { itemId: 'void_crystal', quantity: { min: 1, max: 1 }, chance: 0.05 },
  ],
  void_spawner_loot: [
    { itemId: 'abyssal_pearl', quantity: { min: 1, max: 2 }, chance: 0.25 },
  ],
  wyvern_loot: [
    { itemId: 'phoenix_feather', quantity: { min: 1, max: 1 }, chance: 0.05 },
  ],
};
