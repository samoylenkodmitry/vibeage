import { describe, expect, it } from 'vitest';
import { BOSS_GEAR_ITEMS, BOSS_GEAR_RECIPE_BY_BOSS } from '../packages/content/bossGear';
import { ITEMS } from '../packages/content/items';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { LOOT_TABLES } from '../packages/content/lootTables';
import { applyCraftRecipe } from '../server/inventory/craftRecipe';
import { createTransientPlayer } from '../server/playerFactory';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';

describe('boss gear catalog', () => {
  it('every boss has exactly one gear piece + one recipe', () => {
    for (const bossId of Object.keys(MINI_BOSSES)) {
      const recipeId = BOSS_GEAR_RECIPE_BY_BOSS[bossId];
      expect(recipeId, `boss ${bossId} missing recipe`).toBeTruthy();
      const recipe = ITEMS[recipeId];
      expect(recipe?.type).toBe('recipe');
      expect(recipe?.recipe).toBeDefined();
      const outputId = recipe!.recipe!.output.itemId;
      const output = ITEMS[outputId];
      expect(output, `recipe ${recipeId} → output ${outputId} not in ITEMS`).toBeTruthy();
      expect(output!.type === 'weapon' || output!.type === 'armor').toBe(true);
    }
  });

  it('every recipe input resolves to a real item', () => {
    for (const item of Object.values(BOSS_GEAR_ITEMS)) {
      if (item.type !== 'recipe' || !item.recipe) continue;
      for (const inp of item.recipe.inputs) {
        expect(ITEMS[inp.itemId], `recipe ${item.id} input ${inp.itemId} missing from ITEMS`).toBeTruthy();
        expect(inp.quantity).toBeGreaterThan(0);
      }
    }
  });

  it('every boss loot table now lists its recipe as a rare drop', () => {
    for (const boss of Object.values(MINI_BOSSES)) {
      const recipeId = BOSS_GEAR_RECIPE_BY_BOSS[boss.id];
      const table = LOOT_TABLES[boss.lootTableId];
      expect(table.drops.some((d) => d.itemId === recipeId)).toBe(true);
    }
  });
});

describe('applyCraftRecipe', () => {
  it('consumes inputs + recipe and grants the output', () => {
    const player = createTransientPlayer('s1', 't1');
    // Seed inventory with everything needed for Hammerback's recipe.
    expect(addItemsToPlayer(player, 'recipe_slab_warhammer', 1).ok).toBe(true);
    expect(addItemsToPlayer(player, 'hammerback_slab_chip', 1).ok).toBe(true);
    expect(addItemsToPlayer(player, 'troll_bone', 4).ok).toBe(true);
    expect(addItemsToPlayer(player, 'orc_fang', 3).ok).toBe(true);

    const recipeSlot = player.inventory.findIndex((s) => s?.itemId === 'recipe_slab_warhammer');
    expect(recipeSlot).toBeGreaterThanOrEqual(0);
    const result = applyCraftRecipe(player, recipeSlot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputId).toBe('slab_warhammer');
    }
    const has = (id: string) => player.inventory.find((s) => s?.itemId === id);
    expect(has('slab_warhammer')).toBeTruthy();
    expect(has('recipe_slab_warhammer')).toBeFalsy();
    expect(has('hammerback_slab_chip')).toBeFalsy();
    expect(has('troll_bone')).toBeFalsy();
    expect(has('orc_fang')).toBeFalsy();
  });

  it('rejects with missingIngredients when an input is short', () => {
    const player = createTransientPlayer('s2', 't2');
    addItemsToPlayer(player, 'recipe_slab_warhammer', 1);
    addItemsToPlayer(player, 'hammerback_slab_chip', 1);
    addItemsToPlayer(player, 'troll_bone', 4);
    // missing orc_fang × 3
    const recipeSlot = player.inventory.findIndex((s) => s?.itemId === 'recipe_slab_warhammer');
    const result = applyCraftRecipe(player, recipeSlot);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('missingIngredients');
    // Nothing got consumed (atomicity).
    const has = (id: string) => player.inventory.find((s) => s?.itemId === id);
    expect(has('recipe_slab_warhammer')).toBeTruthy();
    expect(has('hammerback_slab_chip')).toBeTruthy();
    expect(has('troll_bone')?.quantity).toBe(4);
  });

  it('rejects with notRecipe for a non-recipe slot', () => {
    const player = createTransientPlayer('s3', 't3');
    addItemsToPlayer(player, 'health_potion', 1);
    const slot = player.inventory.findIndex((s) => s?.itemId === 'health_potion');
    const result = applyCraftRecipe(player, slot);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('notRecipe');
  });

  // §49/M2 — Grakk's `recipe_chieftains_cleaver` is the *first*
  // boss gear recipe a new player encounters (bounty quest from
  // Mira). Dedicated coverage so the starter-trophy → first-craft
  // loop is locked down, separate from the Hammerback case above.
  it('Chieftain\'s Cleaver: consumes Grakk trophy + ingredients and grants the cleaver', () => {
    const player = createTransientPlayer('s-grakk', 't-grakk');
    expect(addItemsToPlayer(player, 'recipe_chieftains_cleaver', 1).ok).toBe(true);
    expect(addItemsToPlayer(player, 'grakk_warband_horn', 1).ok).toBe(true);
    expect(addItemsToPlayer(player, 'goblin_ear', 6).ok).toBe(true);
    expect(addItemsToPlayer(player, 'troll_bone', 2).ok).toBe(true);

    const recipeSlot = player.inventory.findIndex((s) => s?.itemId === 'recipe_chieftains_cleaver');
    expect(recipeSlot).toBeGreaterThanOrEqual(0);
    const result = applyCraftRecipe(player, recipeSlot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputId).toBe('chieftains_cleaver');
      expect(result.recipeId).toBe('recipe_chieftains_cleaver');
    }
    const has = (id: string) => player.inventory.find((s) => s?.itemId === id);
    expect(has('chieftains_cleaver')).toBeTruthy();
    expect(has('recipe_chieftains_cleaver')).toBeFalsy();
    expect(has('grakk_warband_horn')).toBeFalsy();
    expect(has('goblin_ear')).toBeFalsy();
    expect(has('troll_bone')).toBeFalsy();
  });

  it('Chieftain\'s Cleaver: short on goblin_ear → missingIngredients, atomicity preserved', () => {
    const player = createTransientPlayer('s-grakk-short', 't-short');
    addItemsToPlayer(player, 'recipe_chieftains_cleaver', 1);
    addItemsToPlayer(player, 'grakk_warband_horn', 1);
    addItemsToPlayer(player, 'goblin_ear', 5);
    addItemsToPlayer(player, 'troll_bone', 2);

    const recipeSlot = player.inventory.findIndex((s) => s?.itemId === 'recipe_chieftains_cleaver');
    const result = applyCraftRecipe(player, recipeSlot);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('missingIngredients');
    const has = (id: string) => player.inventory.find((s) => s?.itemId === id);
    expect(has('recipe_chieftains_cleaver')).toBeTruthy();
    expect(has('grakk_warband_horn')).toBeTruthy();
    expect(has('goblin_ear')?.quantity).toBe(5);
    expect(has('troll_bone')?.quantity).toBe(2);
  });
});
