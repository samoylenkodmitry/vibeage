import { ENEMY_TEMPLATES, type EnemyTemplate } from './enemies.js';
import { LOOT_TABLES } from './lootTables.js';
import { MINI_BOSSES, type MiniBossSpec } from './miniBosses.js';

/**
 * PR T — reverse lookup. Given an item id, list every loot table
 * that can drop it, with the per-drop chance + quantity range.
 * Wiki "Dropped by …" reads this; runtime drops read LOOT_TABLES
 * directly, so the surfaces share one source of truth.
 */
export type LootSource = {
  tableId: string;
  chance: number;
  quantity: { min: number; max: number };
};

export function getLootSourcesForItem(itemId: string): LootSource[] {
  const out: LootSource[] = [];
  for (const table of Object.values(LOOT_TABLES)) {
    for (const drop of table.drops) {
      if (drop.itemId === itemId) {
        out.push({ tableId: table.id, chance: drop.chance, quantity: drop.quantity });
      }
    }
  }
  return out;
}

/**
 * PR T — bridge a loot-table id back to the entity that owns it,
 * so the Wiki can render "Dropped by Vorthax" or "Dropped by Goblin"
 * chips on every item.
 *
 * Resolution order: mini-bosses first (they always have an explicit
 * lootTableId), then fall back to the mob-template default
 * convention `${type}_loot`. Returns null for unowned ids (custom
 * tables, future additions).
 */
export type LootTableOwner =
  | { kind: 'boss'; spec: MiniBossSpec }
  | { kind: 'mob'; template: EnemyTemplate };

export function resolveLootTableOwner(tableId: string): LootTableOwner | null {
  for (const spec of Object.values(MINI_BOSSES)) {
    if (spec.lootTableId === tableId) return { kind: 'boss', spec };
  }
  for (const template of Object.values(ENEMY_TEMPLATES)) {
    if ((template.lootTableId ?? `${template.type}_loot`) === tableId) {
      return { kind: 'mob', template };
    }
  }
  return null;
}
