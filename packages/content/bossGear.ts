import type { Item, RecipeSpec } from './items.js';

/**
 * PR U — boss-tier equipment + recipes. The single source of truth
 * for craftable gear that consumes a boss trophy plus a couple of
 * common materials. Each boss gets:
 *   - one equipment piece (the "real" reward — sword, helm, etc.)
 *   - one recipe ITEM that produces it
 *
 * Both are spread into `ITEMS` from items.ts. The recipe item id
 * also lands in the boss's loot table (miniBosses.ts) as a rare
 * extra drop, so killing the boss has two payouts: the guaranteed
 * trophy material (PR O) and the rare recipe (this PR). Stack the
 * recipe + 2-3 common mats and craft the gear.
 *
 * Crafting itself is engine code (server/inventory/craftRecipe.ts);
 * this module declares only data so the Wiki + the runtime share
 * one record.
 */
type BossGearDef = {
  bossId: string;
  equip: Item;
  recipe: Item;
};

function recipeItem(
  recipeId: string,
  name: string,
  output: { itemId: string; level: number },
  inputs: ReadonlyArray<{ itemId: string; quantity: number }>,
): Item {
  const spec: RecipeSpec = {
    inputs,
    output: { itemId: output.itemId, quantity: 1 },
  };
  return {
    id: recipeId,
    name,
    description: `A crafting recipe. Use from your bag while carrying every listed material to produce 1× ${output.itemId} (Lv ${output.level}+).`,
    icon: `${recipeId}.svg`,
    stackable: true,
    maxStack: 5,
    type: 'recipe',
    recipe: spec,
  };
}

const GEAR: BossGearDef[] = [
  {
    bossId: 'grakk',
    equip: {
      id: 'chieftains_cleaver',
      name: "Chieftain's Cleaver",
      description: "Grakk's notched bone-and-iron cleaver. Crude, balanced, lethal.",
      icon: 'chieftains_cleaver.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'd', weight: 2400,
      equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], weaponType: 'sword', handUsage: 'oneHand', requirements: { minLevel: 5 } },
      stats: { pAtk: 26, critRate: 4 },
    },
    recipe: recipeItem('recipe_chieftains_cleaver', "Recipe: Chieftain's Cleaver", { itemId: 'chieftains_cleaver', level: 5 }, [
      { itemId: 'grakk_warband_horn', quantity: 1 },
      { itemId: 'goblin_ear', quantity: 6 },
      { itemId: 'troll_bone', quantity: 2 },
    ]),
  },
  {
    bossId: 'old_greyfang',
    equip: {
      id: 'greyfang_leathers',
      name: 'Greyfang Leathers',
      description: "Tough leather plate cut from the alpha's hide. Smells faintly of pine.",
      icon: 'greyfang_leathers.svg', stackable: false, type: 'armor', kind: 'armor', grade: 'd', weight: 4200,
      equip: { bodyPart: 'chest', allowedSlots: ['CHEST'], armorType: 'medium', requirements: { minLevel: 5 } },
      stats: { pDef: 34, moveSpeed: 0.1 },
    },
    recipe: recipeItem('recipe_greyfang_leathers', 'Recipe: Greyfang Leathers', { itemId: 'greyfang_leathers', level: 5 }, [
      { itemId: 'greyfang_pelt', quantity: 1 },
      { itemId: 'wolf_pelt', quantity: 5 },
    ]),
  },
  {
    bossId: 'hammerback',
    equip: {
      id: 'slab_warhammer',
      name: 'Slab Warhammer',
      description: "A chunk of Hammerback's slab fitted to a haft. Both halves still bear his weight.",
      icon: 'slab_warhammer.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'd', weight: 6800,
      equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], weaponType: 'mace', handUsage: 'twoHand', requirements: { minLevel: 7 } },
      stats: { pAtk: 52, attackSpeed: -8 },
    },
    recipe: recipeItem('recipe_slab_warhammer', 'Recipe: Slab Warhammer', { itemId: 'slab_warhammer', level: 7 }, [
      { itemId: 'hammerback_slab_chip', quantity: 1 },
      { itemId: 'troll_bone', quantity: 4 },
      { itemId: 'orc_fang', quantity: 3 },
    ]),
  },
  {
    bossId: 'mistwalker',
    equip: {
      id: 'fogbound_cloak',
      name: 'Fogbound Cloak',
      description: "The Mistwalker's tattered shroud. Footfalls hush around the wearer.",
      icon: 'fogbound_cloak.svg', stackable: false, type: 'armor', kind: 'armor', grade: 'd', weight: 1200,
      equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], armorType: 'light', requirements: { minLevel: 9 } },
      stats: { mDef: 22, moveSpeed: 0.2 },
    },
    recipe: recipeItem('recipe_fogbound_cloak', 'Recipe: Fogbound Cloak', { itemId: 'fogbound_cloak', level: 9 }, [
      { itemId: 'mistwalker_shroud', quantity: 1 },
      { itemId: 'dark_essence', quantity: 4 },
    ]),
  },
  {
    bossId: 'vereth_bone_lord',
    equip: {
      id: 'marrow_focus',
      name: 'Marrow Focus',
      description: "An orb wound with the bones of Vereth's bound dead. Faintly cold to grip.",
      icon: 'marrow_focus.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'c', weight: 1800,
      equip: { bodyPart: 'offHand', allowedSlots: ['OFF_HAND'], weaponType: 'orb', handUsage: 'oneHand', requirements: { minLevel: 9 } },
      stats: { mAtk: 38, mp: 22 },
    },
    recipe: recipeItem('recipe_marrow_focus', 'Recipe: Marrow Focus', { itemId: 'marrow_focus', level: 9 }, [
      { itemId: 'vereth_phylactery', quantity: 1 },
      { itemId: 'dark_essence', quantity: 6 },
      { itemId: 'shadow_essence', quantity: 2 },
    ]),
  },
  {
    bossId: 'vorthax_ember_wyrm',
    equip: {
      id: 'embers_edge',
      name: "Ember's Edge",
      description: "A sword forged around one of Vorthax's scales. The edge holds heat indefinitely.",
      icon: 'embers_edge.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'c', weight: 2200,
      equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], weaponType: 'sword', handUsage: 'oneHand', requirements: { minLevel: 12 } },
      stats: { pAtk: 78, critRate: 6 },
    },
    recipe: recipeItem('recipe_embers_edge', "Recipe: Ember's Edge", { itemId: 'embers_edge', level: 12 }, [
      { itemId: 'vorthax_ember_scale', quantity: 1 },
      { itemId: 'dragon_scale', quantity: 4 },
      { itemId: 'flame_heart', quantity: 1 },
    ]),
  },
  {
    bossId: 'nyaraal',
    equip: {
      id: 'hollow_dagger',
      name: 'Hollow Dagger',
      description: "Forged from Nyaraal's shard. Casts no shadow even in direct light.",
      icon: 'hollow_dagger.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'c', weight: 1100,
      equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], weaponType: 'dagger', handUsage: 'oneHand', requirements: { minLevel: 12 } },
      stats: { pAtk: 54, critRate: 12, attackSpeed: 18 },
    },
    recipe: recipeItem('recipe_hollow_dagger', 'Recipe: Hollow Dagger', { itemId: 'hollow_dagger', level: 12 }, [
      { itemId: 'nyaraal_hollow_shard', quantity: 1 },
      { itemId: 'void_crystal', quantity: 3 },
      { itemId: 'shadow_essence', quantity: 4 },
    ]),
  },
  {
    bossId: 'prism_warden',
    equip: {
      id: 'refraction_staff',
      name: 'Refraction Staff',
      description: "Channels spell energy through the Warden's facet. Damage spreads to nearby foes.",
      icon: 'refraction_staff.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'c', weight: 2600,
      equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], weaponType: 'staff', handUsage: 'twoHand', requirements: { minLevel: 12 } },
      stats: { mAtk: 92, mp: 30 },
    },
    recipe: recipeItem('recipe_refraction_staff', 'Recipe: Refraction Staff', { itemId: 'refraction_staff', level: 12 }, [
      { itemId: 'prism_warden_facet', quantity: 1 },
      { itemId: 'crystal_shard', quantity: 6 },
      { itemId: 'frost_diamond', quantity: 1 },
    ]),
  },
  {
    bossId: 'magmaheart',
    equip: {
      id: 'forge_avatar_plate',
      name: 'Forge-Avatar Plate',
      description: "Plate armor hammered around Magmaheart's core. Lets you walk through molten ground.",
      icon: 'forge_avatar_plate.svg', stackable: false, type: 'armor', kind: 'armor', grade: 'c', weight: 7800,
      equip: { bodyPart: 'chest', allowedSlots: ['CHEST'], armorType: 'heavy', requirements: { minLevel: 14 } },
      stats: { pDef: 88, hp: 60 },
    },
    recipe: recipeItem('recipe_forge_avatar_plate', 'Recipe: Forge-Avatar Plate', { itemId: 'forge_avatar_plate', level: 14 }, [
      { itemId: 'magmaheart_core', quantity: 1 },
      { itemId: 'volcanic_rock', quantity: 6 },
      { itemId: 'fire_gem', quantity: 2 },
    ]),
  },
  {
    bossId: 'skadrun',
    equip: {
      id: 'tundra_helm',
      name: 'Tundra Helm',
      description: "Skadrun's crown reshaped for a mortal head. Storms answer it less reluctantly than they did him.",
      icon: 'tundra_helm.svg', stackable: false, type: 'armor', kind: 'armor', grade: 'c', weight: 3400,
      equip: { bodyPart: 'head', allowedSlots: ['HEAD'], armorType: 'heavy', requirements: { minLevel: 14 } },
      stats: { pDef: 42, mDef: 38, hp: 28 },
    },
    recipe: recipeItem('recipe_tundra_helm', 'Recipe: Tundra Helm', { itemId: 'tundra_helm', level: 14 }, [
      { itemId: 'skadrun_crown_shard', quantity: 1 },
      { itemId: 'ice_essence', quantity: 5 },
      { itemId: 'ice_crystal', quantity: 2 },
    ]),
  },
  {
    bossId: 'elder_vinebrook',
    equip: {
      id: 'vinebound_bow',
      name: 'Vinebound Bow',
      description: "Living silverwood under tension. The string is sap-stained but never frays.",
      icon: 'vinebound_bow.svg', stackable: false, type: 'weapon', kind: 'weapon', grade: 'c', weight: 1900,
      equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND', 'OFF_HAND'], weaponType: 'bow', handUsage: 'bow', requirements: { minLevel: 14 } },
      stats: { pAtk: 84, attackSpeed: 12 },
    },
    recipe: recipeItem('recipe_vinebound_bow', 'Recipe: Vinebound Bow', { itemId: 'vinebound_bow', level: 14 }, [
      { itemId: 'vinebrook_heartwood', quantity: 1 },
      { itemId: 'ethereal_petal', quantity: 4 },
      { itemId: 'ethereal_dust', quantity: 3 },
    ]),
  },
  {
    bossId: 'cthulun',
    equip: {
      id: 'tidal_crown',
      name: 'Tidal Crown',
      description: "Cthulun's barnacle crown re-forged. Salt water seeps from its rim in any climate.",
      icon: 'tidal_crown.svg', stackable: false, type: 'armor', kind: 'armor', grade: 'b', weight: 2100,
      equip: { bodyPart: 'head', allowedSlots: ['HEAD'], armorType: 'medium', requirements: { minLevel: 18 } },
      stats: { pDef: 52, mDef: 52, mp: 45 },
    },
    recipe: recipeItem('recipe_tidal_crown', 'Recipe: Tidal Crown', { itemId: 'tidal_crown', level: 18 }, [
      { itemId: 'cthulun_barnacle_crown', quantity: 1 },
      { itemId: 'abyssal_pearl', quantity: 3 },
      { itemId: 'void_fragment', quantity: 2 },
    ]),
  },
  {
    bossId: 'auriel',
    equip: {
      id: 'dawnfeather_ring',
      name: 'Dawnfeather Ring',
      description: "A single feather from Auriel set in bright silver. Always feels like sunrise.",
      icon: 'dawnfeather_ring.svg', stackable: false, type: 'armor', kind: 'jewelry', grade: 'b', weight: 200,
      equip: { bodyPart: 'ring', allowedSlots: ['RING_LEFT', 'RING_RIGHT'], requirements: { minLevel: 20 } },
      stats: { mAtk: 30, hp: 40, mp: 40 },
    },
    recipe: recipeItem('recipe_dawnfeather_ring', 'Recipe: Dawnfeather Ring', { itemId: 'dawnfeather_ring', level: 20 }, [
      { itemId: 'auriel_dawnfeather', quantity: 1 },
      { itemId: 'celestial_dust', quantity: 4 },
      { itemId: 'star_essence', quantity: 2 },
    ]),
  },
  {
    bossId: 'aethariel',
    equip: {
      id: 'hourglass_pendant',
      name: 'Hourglass Pendant',
      description: "Sand from Aethariel's hourglasses suspended in glass. Time around the wearer hesitates.",
      icon: 'hourglass_pendant.svg', stackable: false, type: 'armor', kind: 'jewelry', grade: 'b', weight: 300,
      equip: { bodyPart: 'neck', allowedSlots: ['NECK'], requirements: { minLevel: 24 } },
      stats: { mAtk: 40, attackSpeed: 14, moveSpeed: 0.3 },
    },
    recipe: recipeItem('recipe_hourglass_pendant', 'Recipe: Hourglass Pendant', { itemId: 'hourglass_pendant', level: 24 }, [
      { itemId: 'aethariel_hourglass_sand', quantity: 1 },
      { itemId: 'temporal_fragment', quantity: 4 },
      { itemId: 'temporal_shard', quantity: 3 },
    ]),
  },
];

export const BOSS_GEAR_ITEMS: Record<string, Item> = Object.fromEntries(
  GEAR.flatMap((g) => [
    [g.equip.id, g.equip],
    [g.recipe.id, g.recipe],
  ]),
);

/** Map boss id → its recipe item id, for the boss loot table augmentation. */
export const BOSS_GEAR_RECIPE_BY_BOSS: Record<string, string> = Object.fromEntries(
  GEAR.map((g) => [g.bossId, g.recipe.id]),
);
