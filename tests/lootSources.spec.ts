import { describe, expect, it } from 'vitest';
import {
  getLootSourcesForItem,
  resolveLootTableOwner,
} from '../packages/content/lootSources';
import { LOOT_TABLES } from '../packages/content/lootTables';
import { MINI_BOSSES } from '../packages/content/miniBosses';

describe('loot source reverse lookups', () => {
  it('every boss trophy resolves back to its boss loot table', () => {
    for (const boss of Object.values(MINI_BOSSES)) {
      const sources = getLootSourcesForItem(boss.trophyItemId);
      expect(sources.length, `trophy ${boss.trophyItemId} has no drop sources`).toBeGreaterThan(0);
      const match = sources.find((s) => s.tableId === boss.lootTableId);
      expect(match, `trophy ${boss.trophyItemId} missing from boss table ${boss.lootTableId}`).toBeDefined();
      expect(match?.chance).toBeGreaterThan(0);
    }
  });

  it('reverse lookup is consistent with the forward LOOT_TABLES entries', () => {
    for (const [tableId, table] of Object.entries(LOOT_TABLES)) {
      for (const drop of table.drops) {
        const back = getLootSourcesForItem(drop.itemId);
        expect(
          back.some((s) => s.tableId === tableId && s.chance === drop.chance),
          `forward drop ${tableId} → ${drop.itemId} missing from reverse lookup`,
        ).toBe(true);
      }
    }
  });

  it('resolveLootTableOwner maps boss + mob tables to the right entity kind', () => {
    for (const boss of Object.values(MINI_BOSSES)) {
      const owner = resolveLootTableOwner(boss.lootTableId);
      expect(owner?.kind).toBe('boss');
      if (owner?.kind === 'boss') {
        expect(owner.spec.id).toBe(boss.id);
      }
    }
    // The default convention table for normal mobs resolves to mob.
    const goblinOwner = resolveLootTableOwner('goblin_loot');
    expect(goblinOwner?.kind).toBe('mob');
    if (goblinOwner?.kind === 'mob') {
      expect(goblinOwner.template.type).toBe('goblin');
    }
    expect(resolveLootTableOwner('this_does_not_exist')).toBeNull();
  });
});
