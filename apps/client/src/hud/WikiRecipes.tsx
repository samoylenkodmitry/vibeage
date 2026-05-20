import { useEffect, useMemo, useRef } from 'react';
import { ITEMS, type Item } from '../../../../packages/content/items';
import { listRecipeItems, recipesProducing, recipesUsingMaterial } from '../../../../packages/content/recipeLookups';
import type { WikiNav } from './WikiBosses';

/**
 * PR U — Wiki Recipes tab + cross-links. Recipes are items
 * (type: 'recipe' with a recipe payload) so the catalog is a
 * filtered view of ITEMS. Each row links every input + the output
 * back to the Items tab, closing the content loop:
 *   Boss → Item (trophy) → recipes-using-this → Item (output)
 *
 * Reverse lookups (`recipesUsingMaterial`, `recipesProducing`)
 * moved to packages/content/recipeLookups.ts in §49/M2 so the
 * inventory tooltip can share them without a tsx-to-tsx import.
 */
function listRecipes(): Item[] { return listRecipeItems(); }

export { recipesUsingMaterial, recipesProducing };

export function RecipesTab({
  query, focusId, focusKey, navigate,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => listRecipes().filter((r) =>
    matches(`${r.id} ${r.name} ${r.description} ${r.recipe?.output.itemId ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((recipe) => (
        <RecipeLi key={recipe.id} recipe={recipe} isFocus={recipe.id === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function RecipeLi({
  recipe, isFocus, focusKey, navigate,
}: { recipe: Item; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  const spec = recipe.recipe!;
  const outputItem = ITEMS[spec.output.itemId];
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong>{recipe.name}</strong>
        <span className="wiki-row-tag">recipe</span>
      </header>
      <p>{recipe.description}</p>
      <small className="wiki-row-footer">
        Inputs:{' '}
        {spec.inputs.map((inp, i) => {
          const it = ITEMS[inp.itemId];
          return (
            <span key={`${inp.itemId}-${i}`}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', inp.itemId)}>
                {(it?.name ?? inp.itemId)} ×{inp.quantity}
              </button>
            </span>
          );
        })}
      </small>
      <small className="wiki-row-footer">
        Output:{' '}
        <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', spec.output.itemId)}>
          {(outputItem?.name ?? spec.output.itemId)} ×{spec.output.quantity}
        </button>
      </small>
    </li>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
