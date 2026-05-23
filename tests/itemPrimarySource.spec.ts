import { describe, expect, it } from 'vitest';
import { formatPrimarySource } from '../apps/client/src/hud/ItemTooltip';
import type { ItemSource } from '../packages/content/obtainability';
import { getItemSources } from '../packages/content/obtainability';
import { ITEMS } from '../packages/content/items';

// §49/M8 + M14 — item tooltip source hint. Verifies the priority
// order vendor > recipe > loot (boss > mob) > quest and that the
// label resolves ids to display names.

describe('formatPrimarySource', () => {
  it('vendor wins over loot/recipe/quest when multiple sources exist', () => {
    const sources: ItemSource[] = [
      { kind: 'loot', tableId: 'goblin_loot', enemyType: 'goblin' },
      { kind: 'vendor', vendorId: 'gludin_tinker', vendorName: 'Tinker Drev', price: 50 },
      { kind: 'quest', questId: 'rats_in_the_cellar', questName: 'Rats in the Cellar' },
    ];
    expect(formatPrimarySource(sources)).toBe('Sold by Tinker Drev');
  });

  it('recipe label resolves to the recipe item display name', () => {
    expect(formatPrimarySource([{ kind: 'recipe', recipeItemId: 'health_potion' }]))
      .toBe(`Crafted from ${ITEMS.health_potion.name}`);
  });

  it('loot prefers boss display name over mob', () => {
    expect(formatPrimarySource([{
      kind: 'loot', tableId: 'boss_loot_grakk', bossId: 'grakk', enemyType: 'goblin',
    }])).toMatch(/Dropped by .+ Goblin Chief/);
  });

  it('loot falls back to mob display name when no boss id', () => {
    expect(formatPrimarySource([{ kind: 'loot', tableId: 'goblin_loot', enemyType: 'goblin' }]))
      .toBe('Dropped by Goblin');
  });

  it('quest reward fallback when nothing else applies', () => {
    expect(formatPrimarySource([{ kind: 'quest', questId: 'q1', questName: 'Tutorial Quest' }]))
      .toBe('Quest reward: Tutorial Quest');
  });

  it('returns null when no sources', () => {
    expect(formatPrimarySource([])).toBeNull();
  });

  it('end-to-end: real vendor item resolves via getItemSources', () => {
    // Worn sword is sold by Tinker Drev.
    const sources = getItemSources('worn_sword');
    expect(formatPrimarySource(sources)).toBe('Sold by Tinker Drev');
  });

  it('every recipe item has at least one source (no hanging recipes in the wiki)', () => {
    // User reported "recipes in wiki doesn't link who drops them".
    // Anchor that every recipe item has a getItemSources entry, so
    // the RecipesTab "Source: …" line always has something to show.
    const orphans = Object.values(ITEMS)
      .filter((it) => it.type === 'recipe')
      .filter((it) => getItemSources(it.id).length === 0)
      .map((it) => it.id);
    expect(orphans, `recipes without sources: ${orphans.join(', ')}`).toEqual([]);
  });
});
