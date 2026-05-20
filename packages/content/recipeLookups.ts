import { ITEMS, type Item } from './items.js';

/**
 * Recipe reverse-lookups. Recipes themselves live as items (with
 * `type: 'recipe'` + `recipe` payload), so these helpers walk the
 * ITEMS table and project the recipe set. Kept in `packages/content`
 * so both the Wiki tab AND the inventory ItemTooltip can share the
 * same lookups without a tsx-to-tsx import.
 */
export function listRecipeItems(): Item[] {
  const out: Item[] = [];
  for (const item of Object.values(ITEMS)) {
    if (item.type === 'recipe' && item.recipe) out.push(item);
  }
  return out;
}

/** Recipes whose inputs contain `itemId` — i.e. "what can I craft with this?". */
export function recipesUsingMaterial(itemId: string): Item[] {
  return listRecipeItems().filter((r) => r.recipe!.inputs.some((i) => i.itemId === itemId));
}

/** Recipes whose output is `itemId` — i.e. "how do I get this?". */
export function recipesProducing(itemId: string): Item[] {
  return listRecipeItems().filter((r) => r.recipe!.output.itemId === itemId);
}
