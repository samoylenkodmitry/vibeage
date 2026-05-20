import type { Item, RecipeSpec } from './items.js';

/**
 * §49/M1+ — meadow trophy recipes.
 *
 * Three starter mob trophies (`slime_jelly`, `sprite_glow`,
 * `phoenix_feather`) had a source but no use — they were flagged
 * by `pnpm run content:audit`. Adding a tiny recipe per trophy
 * gives each a real downstream consumer + a craftable starter
 * consumable, which slots naturally into the L1-10 economy
 * (Thala already sells potions; these are the player-made path).
 *
 * Same pattern as `bossGear.ts`: each recipe is itself an item
 * with `type: 'recipe'`. The recipes ship as starter content
 * (sold by Tinker Drev so they're obvious + obtainable without
 * the player needing to find a recipe drop).
 */
function recipeItem(
  recipeId: string,
  name: string,
  outputItemId: string,
  inputs: ReadonlyArray<{ itemId: string; quantity: number }>,
): Item {
  const spec: RecipeSpec = { inputs, output: { itemId: outputItemId, quantity: 1 } };
  return {
    id: recipeId,
    name,
    description: `Use from your bag while carrying every listed material to produce 1× ${outputItemId}.`,
    icon: `${recipeId}.svg`,
    stackable: true,
    maxStack: 10,
    type: 'recipe',
    recipe: spec,
  };
}

export const MEADOW_TROPHY_RECIPE_ITEMS: Record<string, Item> = Object.fromEntries([
  // Slime jelly → health potion. Slimes are everywhere in the
  // meadow; this gives a fresh player a player-made path to
  // potions when they're broke.
  ['recipe_slime_salve', recipeItem('recipe_slime_salve', 'Recipe: Slime Salve',
    'health_potion',
    [{ itemId: 'slime_jelly', quantity: 4 }],
  )],
  // Sprite glow → mana potion. Same idea for casters.
  ['recipe_sprite_phial', recipeItem('recipe_sprite_phial', 'Recipe: Sprite-Lit Phial',
    'mana_potion',
    [{ itemId: 'sprite_glow', quantity: 4 }],
  )],
  // Phoenix feather → greater health potion. Phoenix feathers are
  // a rare wyvern drop; the recipe is a meaningful payoff for the
  // mid-tier mob without inventing new equipment.
  ['recipe_phoenix_draught', recipeItem('recipe_phoenix_draught', 'Recipe: Phoenix Draught',
    'greater_health_potion',
    [{ itemId: 'phoenix_feather', quantity: 1 }],
  )],
].map((entry) => [entry[0], entry[1]] as const));

/**
 * Item ids of every meadow-trophy recipe — used by the vendor
 * stock + the obtainability validator. Source of truth is the
 * record above so they don't drift.
 */
export const MEADOW_TROPHY_RECIPE_IDS = Object.keys(MEADOW_TROPHY_RECIPE_ITEMS);
