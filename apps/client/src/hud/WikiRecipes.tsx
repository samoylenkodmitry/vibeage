import { useEffect, useMemo, useRef } from 'react';
import { ITEMS, type Item } from '../../../../packages/content/items';
import { listRecipeItems, recipesProducing, recipesUsingMaterial } from '../../../../packages/content/recipeLookups';
import { getItemSources } from '../../../../packages/content/obtainability';
import { ENEMY_TEMPLATES } from '../../../../packages/content/enemies';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { EQUIPMENT_SETS } from '../../../../packages/content/equipmentSets';
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
      {outputItem && <OutputStatsLine item={outputItem} />}
      {outputItem?.setId && <OutputSetLine setId={outputItem.setId} navigate={navigate} />}
      <RecipeSourceLine recipeId={recipe.id} navigate={navigate} />
    </li>
  );
}

function OutputStatsLine({ item }: { item: Item }) {
  const stats = item.stats ?? {};
  const parts: string[] = [];
  if (stats.pAtk) parts.push(`+${stats.pAtk} P.Atk`);
  if (stats.mAtk) parts.push(`+${stats.mAtk} M.Atk`);
  if (stats.pDef) parts.push(`+${stats.pDef} P.Def`);
  if (stats.mDef) parts.push(`+${stats.mDef} M.Def`);
  if (stats.hp) parts.push(`+${stats.hp} HP`);
  if (stats.mp) parts.push(`+${stats.mp} MP`);
  if (stats.critRate) parts.push(`+${stats.critRate} crit`);
  if (item.healAmount) parts.push(`Heals ${item.healAmount}`);
  if (item.manaAmount) parts.push(`Restores ${item.manaAmount} MP`);
  if (parts.length === 0) return null;
  return <small className="wiki-row-footer">Output stats: {parts.join(' · ')}</small>;
}

function OutputSetLine({ setId, navigate }: { setId: string; navigate: WikiNav }) {
  const set = EQUIPMENT_SETS[setId];
  if (!set) return null;
  return (
    <small className="wiki-row-footer">
      Part of:{' '}
      <button type="button" className="wiki-effect-chip" onClick={() => navigate('sets', set.setId)}>{set.name}</button>
    </small>
  );
}

function RecipeSourceLine({ recipeId, navigate }: { recipeId: string; navigate: WikiNav }) {
  const sources = getItemSources(recipeId);
  const chips = sources.map((src, i) => {
    const key = `${src.kind}-${i}`;
    if (src.kind === 'loot' && src.bossId) {
      const boss = getMiniBossById(src.bossId);
      return boss
        ? <button key={key} type="button" className="wiki-effect-chip" onClick={() => navigate('bosses', boss.id)}>{boss.name}</button>
        : null;
    }
    if (src.kind === 'loot' && src.enemyType) {
      const mob = ENEMY_TEMPLATES[src.enemyType];
      return mob
        ? <button key={key} type="button" className="wiki-effect-chip" onClick={() => navigate('mobs', mob.type)}>{mob.displayName}</button>
        : null;
    }
    if (src.kind === 'vendor') {
      return <button key={key} type="button" className="wiki-effect-chip" onClick={() => navigate('vendors', src.vendorId)}>Sold by {src.vendorName}</button>;
    }
    if (src.kind === 'quest') {
      return <button key={key} type="button" className="wiki-effect-chip" onClick={() => navigate('quests', src.questId)}>Quest: {src.questName}</button>;
    }
    return null;
  }).filter(Boolean);
  if (chips.length === 0) {
    return <small className="wiki-row-footer wiki-row-footer--orphan">Source: not yet placed in the world</small>;
  }
  return (
    <small className="wiki-row-footer">
      Source:{' '}
      {chips.map((chip, i) => <span key={i}>{i > 0 && ', '}{chip}</span>)}
    </small>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
