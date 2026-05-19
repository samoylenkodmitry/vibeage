import { ITEMS, type Item } from './items.js';
import { LOOT_TABLES } from './lootTables.js';
import { MINI_BOSSES } from './miniBosses.js';
import { QUEST_NPCS } from './npcs.js';
import { QUESTS } from './quests.js';
import { VENDORS } from './vendors.js';
import { ENEMY_TEMPLATES } from './enemies.js';
import { GAME_ZONES } from './zones.js';

/**
 * PR HH — obtainability index. For any item id, enumerates every
 * spec-driven path the player can use to get one (vendor stock,
 * loot table drops, crafting recipes, quest reward grants). Read
 * by the wiki + by the content-graph validator. Pure derivation
 * from the existing registries — no per-item override list.
 *
 * Adding a new source kind (e.g. faction reward) means adding one
 * function here and one branch in the wiki renderer; the validator
 * picks it up automatically because it just calls `getItemSources`.
 */
export type ItemVendorSource = {
  kind: 'vendor';
  vendorId: string;
  vendorName: string;
  price: number;
};

export type ItemLootSource = {
  kind: 'loot';
  tableId: string;
  // `enemyType` set when a mob template loot table id matches; bosses
  // resolve via the MINI_BOSSES loot table id. The wiki uses this to
  // pick the right cross-link target (mobs tab vs bosses tab).
  enemyType?: string;
  bossId?: string;
};

export type ItemRecipeSource = {
  kind: 'recipe';
  recipeItemId: string;
};

export type ItemQuestRewardSource = {
  kind: 'quest';
  questId: string;
  questName: string;
};

export type ItemSource =
  | ItemVendorSource
  | ItemLootSource
  | ItemRecipeSource
  | ItemQuestRewardSource;

export function getVendorSourcesFor(itemId: string): ItemVendorSource[] {
  const out: ItemVendorSource[] = [];
  for (const vendor of Object.values(VENDORS)) {
    for (const entry of vendor.stock) {
      if (entry.itemId === itemId) {
        out.push({ kind: 'vendor', vendorId: vendor.id, vendorName: vendor.name, price: entry.price });
      }
    }
  }
  return out;
}

export function getLootSourcesFor(itemId: string): ItemLootSource[] {
  const out: ItemLootSource[] = [];
  for (const [tableId, table] of Object.entries(LOOT_TABLES)) {
    for (const drop of table.drops) {
      if (drop.itemId === itemId) {
        const enemyType = Object.keys(ENEMY_TEMPLATES).find((type) => `${type}_loot` === tableId);
        const bossId = Object.values(MINI_BOSSES).find((b) => b.lootTableId === tableId)?.id;
        out.push({ kind: 'loot', tableId, enemyType, bossId });
        break; // one entry per table
      }
    }
  }
  return out;
}

export function getRecipeSourcesFor(itemId: string): ItemRecipeSource[] {
  const out: ItemRecipeSource[] = [];
  for (const item of Object.values(ITEMS)) {
    if (item.recipe?.output.itemId === itemId) {
      out.push({ kind: 'recipe', recipeItemId: item.id });
    }
  }
  return out;
}

export function getQuestRewardSourcesFor(itemId: string): ItemQuestRewardSource[] {
  const out: ItemQuestRewardSource[] = [];
  for (const quest of Object.values(QUESTS)) {
    if (quest.reward.items?.some((g) => g.itemId === itemId)) {
      out.push({ kind: 'quest', questId: quest.id, questName: quest.name });
    }
  }
  return out;
}

/**
 * All ways to obtain `itemId`. Empty array means "hanging item" —
 * the validator will fail CI for items whose id isn't on the
 * whitelist.
 */
export function getItemSources(itemId: string): ItemSource[] {
  return [
    ...getVendorSourcesFor(itemId),
    ...getLootSourcesFor(itemId),
    ...getRecipeSourcesFor(itemId),
    ...getQuestRewardSourcesFor(itemId),
  ];
}

/**
 * Items the validator is allowed to ignore even when zero sources
 * resolve. Currency is spent, not obtained directly. Future
 * scaffolding can land here too.
 */
export const OBTAINABILITY_WHITELIST: ReadonlySet<string> = new Set<string>([
  // Currency: credited from quests + loot indirectly via gold_coin
  // auto-conversion; the item template itself has no source by design.
  'gold_coin',
  'silver_coin',
  'platinum_coin',
  // PR HH — flavour / future-content placeholders. Listed in ITEMS so
  // the catalog and wiki can render them, but no in-game source yet.
  // Re-evaluate every time we touch the obtainability index: if a
  // quest hook lands for ancient_tome (etc.), drop it from this list.
  'ancient_tome',
  'sealed_letter',
  'mysterious_artifact',
  'dungeon_key',
  'teleport_scroll',
  'experience_orb',
  'shadow_crown',
]);

/**
 * Build the full content graph and return every dangling reference.
 * Validator (tests/contentGraph.spec.ts) fails when the result is
 * non-empty. Each issue carries enough context to fix at the source.
 */
export type ContentGraphIssue =
  | { kind: 'hanging-item'; itemId: string }
  | { kind: 'hanging-mob'; type: string }
  | { kind: 'hanging-npc'; npcId: string }
  | { kind: 'unknown-item'; itemId: string; referencedBy: string }
  | { kind: 'unknown-mob'; type: string; referencedBy: string }
  | { kind: 'unknown-npc'; npcId: string; referencedBy: string }
  | { kind: 'unknown-boss'; bossId: string; referencedBy: string };

export function validateContentGraph(): ContentGraphIssue[] {
  const issues: ContentGraphIssue[] = [];
  const itemIds = new Set(Object.keys(ITEMS));
  const mobTypes = new Set(Object.keys(ENEMY_TEMPLATES));
  const npcIds = new Set(Object.keys(QUEST_NPCS));
  const bossIds = new Set(Object.keys(MINI_BOSSES));

  // Reachable sets — built by walking the spec graph.
  const reachableMobs = new Set<string>();
  const reachableNpcs = new Set<string>();

  for (const zone of GAME_ZONES) {
    for (const m of zone.mobs) reachableMobs.add(m.type);
    if (zone.miniBoss) reachableMobs.add(zone.miniBoss.type);
  }
  for (const quest of Object.values(QUESTS)) {
    reachableNpcs.add(quest.npcId);
  }
  for (const vendor of Object.values(VENDORS)) {
    reachableNpcs.add(vendor.npcId);
  }

  // Hanging items: nothing produces them and they aren't whitelisted.
  for (const item of Object.values(ITEMS)) {
    if (OBTAINABILITY_WHITELIST.has(item.id)) continue;
    if (getItemSources(item.id).length === 0) {
      issues.push({ kind: 'hanging-item', itemId: item.id });
    }
  }

  // Hanging mobs: defined in ENEMY_TEMPLATES but no zone spawn refs them.
  for (const type of mobTypes) {
    if (!reachableMobs.has(type)) {
      issues.push({ kind: 'hanging-mob', type });
    }
  }

  // Hanging NPCs: defined in QUEST_NPCS but no quest or vendor refs them.
  for (const npcId of npcIds) {
    if (!reachableNpcs.has(npcId)) {
      issues.push({ kind: 'hanging-npc', npcId });
    }
  }

  // Cross-reference checks: every id mentioned in a spec resolves.
  for (const quest of Object.values(QUESTS)) {
    if (!npcIds.has(quest.npcId)) {
      issues.push({ kind: 'unknown-npc', npcId: quest.npcId, referencedBy: `quest:${quest.id}` });
    }
    for (const grant of quest.reward.items ?? []) {
      if (!itemIds.has(grant.itemId)) {
        issues.push({ kind: 'unknown-item', itemId: grant.itemId, referencedBy: `quest:${quest.id}.reward` });
      }
    }
    for (const stage of quest.stages) {
      const o = stage.objective;
      if (o.kind === 'kill' && !mobTypes.has(o.enemyType)) {
        issues.push({ kind: 'unknown-mob', type: o.enemyType, referencedBy: `quest:${quest.id}.stage` });
      }
      if (o.kind === 'kill_boss' && !bossIds.has(o.bossId)) {
        issues.push({ kind: 'unknown-boss', bossId: o.bossId, referencedBy: `quest:${quest.id}.stage` });
      }
    }
  }

  for (const [tableId, table] of Object.entries(LOOT_TABLES)) {
    for (const drop of table.drops) {
      if (!itemIds.has(drop.itemId)) {
        issues.push({ kind: 'unknown-item', itemId: drop.itemId, referencedBy: `lootTable:${tableId}` });
      }
    }
  }

  for (const vendor of Object.values(VENDORS)) {
    if (!npcIds.has(vendor.npcId)) {
      issues.push({ kind: 'unknown-npc', npcId: vendor.npcId, referencedBy: `vendor:${vendor.id}` });
    }
    for (const entry of vendor.stock) {
      if (!itemIds.has(entry.itemId)) {
        issues.push({ kind: 'unknown-item', itemId: entry.itemId, referencedBy: `vendor:${vendor.id}` });
      }
    }
  }

  for (const item of Object.values(ITEMS)) {
    const recipe = item.recipe;
    if (!recipe) continue;
    for (const input of recipe.inputs) {
      if (!itemIds.has(input.itemId)) {
        issues.push({ kind: 'unknown-item', itemId: input.itemId, referencedBy: `recipe:${item.id}.input` });
      }
    }
    if (!itemIds.has(recipe.output.itemId)) {
      issues.push({ kind: 'unknown-item', itemId: recipe.output.itemId, referencedBy: `recipe:${item.id}.output` });
    }
  }

  return issues;
}

export function formatContentGraphIssues(issues: readonly ContentGraphIssue[]): string {
  return issues.map((issue) => {
    switch (issue.kind) {
      case 'hanging-item':
        return `hanging item: ${issue.itemId} (not sold, dropped, crafted, or quest-rewarded)`;
      case 'hanging-mob':
        return `hanging mob: ${issue.type} (no zone spawns it)`;
      case 'hanging-npc':
        return `hanging NPC: ${issue.npcId} (no quest or vendor references it)`;
      case 'unknown-item':
        return `unknown item ${issue.itemId} referenced by ${issue.referencedBy}`;
      case 'unknown-mob':
        return `unknown mob type ${issue.type} referenced by ${issue.referencedBy}`;
      case 'unknown-npc':
        return `unknown NPC ${issue.npcId} referenced by ${issue.referencedBy}`;
      case 'unknown-boss':
        return `unknown boss ${issue.bossId} referenced by ${issue.referencedBy}`;
    }
  }).join('\n');
}

// Unused import guard — Item is exported above for downstream consumers
// but TS strips it otherwise. This re-export keeps the public surface stable.
export type { Item };
