import { describe, expect, it } from 'vitest';
import { ITEMS } from '../packages/content/items';
import { recipesProducing, recipesUsingMaterial } from '../packages/content/recipeLookups';
import { formatRecipeUses } from '../apps/client/src/hud/ItemTooltip';

/**
 * §49/M2 — recipeLookups extract + the tooltip's "Used in" line.
 * Verifies the Grakk trophy advertises Chieftain's Cleaver as a
 * downstream use (the closed-loop the wiki shows, now inline).
 */
describe('recipeLookups', () => {
  it('warband horn (Grakk trophy) is consumed by the Chieftain\'s Cleaver recipe', () => {
    const recipes = recipesUsingMaterial('grakk_warband_horn');
    expect(recipes.length).toBeGreaterThan(0);
    const outputIds = recipes.map((r) => r.recipe!.output.itemId);
    expect(outputIds).toContain('chieftains_cleaver');
  });
  it('chieftains_cleaver has a producing recipe', () => {
    expect(recipesProducing('chieftains_cleaver').length).toBeGreaterThan(0);
  });
  it('a non-material item returns no consuming recipes', () => {
    // health_potion is a consumable; no recipe should consume it as input.
    expect(recipesUsingMaterial('health_potion')).toEqual([]);
  });
});

describe('formatRecipeUses (ItemTooltip line)', () => {
  it('shows the cleaver name for a Grakk trophy', () => {
    const label = formatRecipeUses('grakk_warband_horn');
    expect(label).not.toBeNull();
    expect(label).toContain(ITEMS.chieftains_cleaver?.name ?? 'chieftains_cleaver');
  });
  it('returns null for the recipe item itself (avoids self-reference)', () => {
    expect(formatRecipeUses('recipe_chieftains_cleaver')).toBeNull();
  });
  it('returns null for items nothing consumes', () => {
    expect(formatRecipeUses('health_potion')).toBeNull();
  });
});
