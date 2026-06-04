import { ITEMS } from './items.js';
import { LOOT_TABLES } from './lootTables.js';
import { MINI_BOSSES } from './miniBosses.js';
import { QUEST_NPCS } from './npcs.js';
import { QUESTS } from './quests.js';
import { SKILLS } from './skills.js';
import { SPECIALIZATIONS } from './specializations.js';
import { CLASS_SKILL_TREES } from './classes.js';
import { RACE_PROFILES } from './races.js';
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

type ItemLootSource = {
  kind: 'loot';
  tableId: string;
  // `enemyType` set when a mob template loot table id matches; bosses
  // resolve via the MINI_BOSSES loot table id. The wiki uses this to
  // pick the right cross-link target (mobs tab vs bosses tab).
  enemyType?: string;
  bossId?: string;
};

type ItemRecipeSource = {
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

function getLootSourcesFor(itemId: string): ItemLootSource[] {
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

function getRecipeSourcesFor(itemId: string): ItemRecipeSource[] {
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
const OBTAINABILITY_WHITELIST: ReadonlySet<string> = new Set<string>([
  // Currency: credited from quests + loot indirectly via gold_coin
  // auto-conversion; the item template itself has no source by design.
  'gold_coin',
  'silver_coin',
  'platinum_coin',
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
  | { kind: 'hanging-boss'; bossId: string }
  | { kind: 'unknown-item'; itemId: string; referencedBy: string }
  | { kind: 'unknown-mob'; type: string; referencedBy: string }
  | { kind: 'unknown-npc'; npcId: string; referencedBy: string }
  | { kind: 'unknown-boss'; bossId: string; referencedBy: string }
  // §49/M1 — race/skill/spec/quest/loot/vendor/zone rule checks.
  | { kind: 'unknown-skill'; skillId: string; referencedBy: string }
  | { kind: 'invalid-spec-count'; className: string; got: number }
  | { kind: 'spec-wrong-class'; specId: string; expected: string; got: string }
  | { kind: 'duplicate-quest-stage-id'; questId: string; stageId: string }
  | { kind: 'invalid-loot-chance'; tableId: string; itemId: string; chance: number }
  | { kind: 'non-positive-vendor-price'; vendorId: string; itemId: string; price: number }
  | { kind: 'invalid-zone-level-band'; zoneId: string; minLevel: number; maxLevel: number }
  | { kind: 'race-unknown-class'; race: string; className: string }
  | { kind: 'class-no-allowed-race'; className: string }
  | { kind: 'unknown-quest-prereq'; questId: string; prereqId: string };

/**
 * Pre-built reverse index: `itemId → has at least one source`. Avoids
 * the O(items × loot-tables) hit of calling `getItemSources` per item
 * during validation (Gemini PR-204 review). Vendors / recipes / quests
 * are small enough to stay inline.
 */
function buildItemSourceIndex(): Set<string> {
  const has = new Set<string>();
  for (const vendor of Object.values(VENDORS)) {
    for (const e of vendor.stock) has.add(e.itemId);
  }
  for (const table of Object.values(LOOT_TABLES)) {
    for (const d of table.drops) has.add(d.itemId);
  }
  for (const item of Object.values(ITEMS)) {
    if (item.recipe) has.add(item.recipe.output.itemId);
  }
  for (const quest of Object.values(QUESTS)) {
    for (const g of quest.reward.items ?? []) has.add(g.itemId);
  }
  return has;
}

/**
 * §49/M1+ — mirror of `buildItemSourceIndex` for the destination
 * side. An item is "used" when it:
 *   - is a consumable (player can use it from the bag)
 *   - is equippable (player can equip it)
 *   - is a recipe input (crafted into something)
 *   - is the recipe payload itself (its own use is to be crafted with)
 *   - is currency (`type === 'currency'`; spent at vendors)
 *
 * Whitelist `OBTAINABILITY_WHITELIST` items are exempt from BOTH
 * source and use checks — they're flagged future scaffolding.
 */
function buildItemUseIndex(): Set<string> {
  const used = new Set<string>();
  for (const item of Object.values(ITEMS)) {
    if (item.type === 'consumable') used.add(item.id);
    if (item.type === 'currency') used.add(item.id);
    if (item.equip) used.add(item.id);
    if (item.recipe) {
      used.add(item.id); // recipe item itself has a use (be consumed to craft)
      for (const input of item.recipe.inputs) used.add(input.itemId);
    }
  }
  return used;
}

/**
 * §49/M1+ audit query — items that have a source (loot / vendor /
 * quest / recipe) but nothing consumes them. Excludes the
 * obtainability whitelist (currency + intentional future-content
 * placeholders). Surface in `docs/UNLINKED.md`, not in CI fail.
 */
export function findUnusedItems(): string[] {
  const used = buildItemUseIndex();
  const out: string[] = [];
  for (const item of Object.values(ITEMS)) {
    if (OBTAINABILITY_WHITELIST.has(item.id)) continue;
    if (!used.has(item.id)) out.push(item.id);
  }
  return out.sort();
}

/**
 * §49/M1+ audit query — items that exist in `ITEMS` but have NO
 * source anywhere (no loot table drops them, no vendor sells them,
 * no recipe produces them, no quest rewards them). These are the
 * "hanging in the air" items the wiki can't tell the player how to
 * get. Currency is excluded because it's credited via the gold
 * counter, not via item drops.
 *
 * The whitelist members ARE included here so the audit surfaces
 * them as work to do — being on the whitelist just means CI
 * doesn't fail; the gap is still real.
 */
export function findUnsourcedItems(): { id: string; whitelisted: boolean }[] {
  const out: { id: string; whitelisted: boolean }[] = [];
  for (const item of Object.values(ITEMS)) {
    if (item.type === 'currency') continue;
    if (getItemSources(item.id).length === 0) {
      out.push({ id: item.id, whitelisted: OBTAINABILITY_WHITELIST.has(item.id) });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * §49/M1+ audit query — skills declared in `SKILLS` but not
 * referenced by any class skill tree, spec/proficiency skill
 * list, or universal skill list. Same audit-soft semantics as
 * `findUnusedItems`.
 */
export async function findUnreachableSkills(): Promise<string[]> {
  const { SKILLS, UNIVERSAL_SKILLS } = await import('./skills.js');
  const reachable = new Set<string>(UNIVERSAL_SKILLS);
  for (const tree of Object.values(CLASS_SKILL_TREES)) {
    for (const id of Object.keys(tree.skillProgression)) reachable.add(id);
  }
  for (const spec of Object.values(SPECIALIZATIONS)) {
    for (const id of spec.specSkills ?? []) reachable.add(id);
    for (const id of spec.proficiencySkills ?? []) reachable.add(id);
  }
  for (const template of Object.values(ENEMY_TEMPLATES)) {
    for (const id of template.skills) reachable.add(id);
  }
  return Object.keys(SKILLS).filter((id) => !reachable.has(id)).sort();
}

/**
 * §49/M1+ audit query — mini-bosses defined but not referenced by
 * any quest objective. (They still get spawned via zone.miniBoss
 * — that's the source check. This is the *use* check: "is there
 * a quest that asks the player to kill this boss?")
 */
export function findUnquestedBosses(): string[] {
  const referenced = new Set<string>();
  for (const quest of Object.values(QUESTS)) {
    for (const stage of quest.stages) {
      if (stage.objective.kind === 'kill_boss') referenced.add(stage.objective.bossId);
    }
  }
  return Object.keys(MINI_BOSSES).filter((id) => !referenced.has(id)).sort();
}

export function validateContentGraph(): ContentGraphIssue[] {
  const issues: ContentGraphIssue[] = [];
  const itemIds = new Set(Object.keys(ITEMS));
  const mobTypes = new Set(Object.keys(ENEMY_TEMPLATES));
  const npcIds = new Set(Object.keys(QUEST_NPCS));
  const bossIds = new Set(Object.keys(MINI_BOSSES));

  // Reachable sets — built by walking the spec graph.
  const reachableMobs = new Set<string>();
  const reachableNpcs = new Set<string>();
  const reachableBosses = new Set<string>();

  // Zone walk: also cross-checks every mob.type / miniBoss.id ref
  // against the actual registries, so a typo in zones.ts surfaces
  // here instead of crashing the spawner later.
  for (const zone of GAME_ZONES) {
    for (const m of zone.mobs) {
      if (!mobTypes.has(m.type)) {
        issues.push({ kind: 'unknown-mob', type: m.type, referencedBy: `zone:${zone.id}` });
      }
      reachableMobs.add(m.type);
    }
    if (zone.miniBoss) {
      if (!mobTypes.has(zone.miniBoss.type)) {
        issues.push({ kind: 'unknown-mob', type: zone.miniBoss.type, referencedBy: `zone:${zone.id}.miniBoss` });
      }
      reachableMobs.add(zone.miniBoss.type);
      if (zone.miniBoss.id) {
        if (!bossIds.has(zone.miniBoss.id)) {
          issues.push({ kind: 'unknown-boss', bossId: zone.miniBoss.id, referencedBy: `zone:${zone.id}.miniBoss` });
        }
        reachableBosses.add(zone.miniBoss.id);
      }
    }
  }
  for (const quest of Object.values(QUESTS)) {
    reachableNpcs.add(quest.npcId);
  }
  for (const vendor of Object.values(VENDORS)) {
    reachableNpcs.add(vendor.npcId);
  }

  // Hanging items: nothing produces them and they aren't whitelisted.
  // Uses a pre-built id set so the per-item check is O(1).
  const itemSourceIndex = buildItemSourceIndex();
  for (const item of Object.values(ITEMS)) {
    if (OBTAINABILITY_WHITELIST.has(item.id)) continue;
    if (!itemSourceIndex.has(item.id)) {
      issues.push({ kind: 'hanging-item', itemId: item.id });
    }
  }
  // §49/M1+ — `unused-item` is an audit signal, not a hard CI fail.
  // The audit script (`pnpm run content:audit`) writes the list to
  // a tracked snapshot so adding a new orphan still requires a
  // committed change, but doesn't block PRs.
  // (We don't surface unused-item via validateContentGraph for that
  // reason — see findUnusedItems below.)

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

  // Hanging bosses: defined in MINI_BOSSES but no zone spec spawns them.
  for (const bossId of bossIds) {
    if (!reachableBosses.has(bossId)) {
      issues.push({ kind: 'hanging-boss', bossId });
    }
  }

  // Cross-reference checks: every id mentioned in a spec resolves.
  collectCrossRefIssues(issues, { itemIds, mobTypes, npcIds, bossIds });
  // §49/M1 PR002 — additional graph rules: race/class/skill/spec
  // linkage, quest stage ids, loot chances, vendor prices, zone bands.
  collectStructuralIssues(issues);

  return issues;
}

function collectStructuralIssues(issues: ContentGraphIssue[]): void {
  const skillIds = new Set(Object.keys(SKILLS));
  const classIds = new Set(Object.keys(CLASS_SKILL_TREES));

  // Race graph: every allowed class on a race exists in the class registry.
  for (const race of Object.values(RACE_PROFILES)) {
    for (const cls of race.allowedClasses) {
      if (!classIds.has(cls)) {
        issues.push({ kind: 'race-unknown-class', race: race.race, className: cls });
      }
    }
  }
  // Every class must be playable by at least one race.
  for (const className of classIds) {
    const playable = Object.values(RACE_PROFILES).some((r) => r.allowedClasses.includes(className as never));
    if (!playable) issues.push({ kind: 'class-no-allowed-race', className });
  }

  // Class skill trees: every referenced skill exists in SKILLS.
  for (const tree of Object.values(CLASS_SKILL_TREES)) {
    for (const skillId of Object.keys(tree.skillProgression)) {
      if (!skillIds.has(skillId)) {
        issues.push({ kind: 'unknown-skill', skillId, referencedBy: `class:${tree.className}` });
      }
    }
  }

  // Spec graph: every base class has exactly 2 specs and spec's
  // declared baseClass matches the lookup.
  const specsByClass = new Map<string, string[]>();
  for (const spec of Object.values(SPECIALIZATIONS)) {
    if (!classIds.has(spec.baseClass)) {
      issues.push({ kind: 'race-unknown-class', race: '*spec*', className: spec.baseClass });
    }
    const list = specsByClass.get(spec.baseClass) ?? [];
    list.push(spec.id);
    specsByClass.set(spec.baseClass, list);
    // Spec / proficiency skills must exist.
    for (const skillId of spec.specSkills ?? []) {
      if (!skillIds.has(skillId)) issues.push({ kind: 'unknown-skill', skillId, referencedBy: `spec:${spec.id}.spec` });
    }
    for (const skillId of spec.proficiencySkills ?? []) {
      if (!skillIds.has(skillId)) issues.push({ kind: 'unknown-skill', skillId, referencedBy: `spec:${spec.id}.proficiency` });
    }
  }
  for (const className of classIds) {
    const list = specsByClass.get(className) ?? [];
    if (list.length !== 2) {
      issues.push({ kind: 'invalid-spec-count', className, got: list.length });
    }
  }

  // Quest graph: stage ids unique within a quest + prereq quests exist.
  for (const quest of Object.values(QUESTS)) {
    const seen = new Set<string>();
    for (const stage of quest.stages) {
      const id = stage.id ?? '';
      if (id && seen.has(id)) {
        issues.push({ kind: 'duplicate-quest-stage-id', questId: quest.id, stageId: id });
      }
      seen.add(id);
    }
    // §49/M6 PR029 — every prereq quest id must resolve.
    for (const prereqId of quest.prerequisites?.completedQuests ?? []) {
      if (!QUESTS[prereqId]) {
        issues.push({ kind: 'unknown-quest-prereq', questId: quest.id, prereqId });
      }
    }
  }

  // Loot tables: every chance is in [0, 1].
  for (const [tableId, table] of Object.entries(LOOT_TABLES)) {
    for (const drop of table.drops) {
      if (typeof drop.chance === 'number' && (drop.chance < 0 || drop.chance > 1)) {
        issues.push({ kind: 'invalid-loot-chance', tableId, itemId: drop.itemId, chance: drop.chance });
      }
    }
  }

  // Vendors: every stock price is positive.
  for (const vendor of Object.values(VENDORS)) {
    for (const entry of vendor.stock) {
      if (entry.price <= 0) {
        issues.push({ kind: 'non-positive-vendor-price', vendorId: vendor.id, itemId: entry.itemId, price: entry.price });
      }
    }
  }

  // Zones: maxLevel >= minLevel.
  for (const zone of GAME_ZONES) {
    if (zone.maxLevel < zone.minLevel) {
      issues.push({ kind: 'invalid-zone-level-band', zoneId: zone.id, minLevel: zone.minLevel, maxLevel: zone.maxLevel });
    }
  }
}

type RegistryIdSets = {
  itemIds: ReadonlySet<string>;
  mobTypes: ReadonlySet<string>;
  npcIds: ReadonlySet<string>;
  bossIds: ReadonlySet<string>;
};

function collectCrossRefIssues(issues: ContentGraphIssue[], ids: RegistryIdSets): void {
  const { itemIds, mobTypes, npcIds, bossIds } = ids;
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
      case 'hanging-boss':
        return `hanging boss: ${issue.bossId} (no zone spawns it)`;
      case 'unknown-item':
        return `unknown item ${issue.itemId} referenced by ${issue.referencedBy}`;
      case 'unknown-mob':
        return `unknown mob type ${issue.type} referenced by ${issue.referencedBy}`;
      case 'unknown-npc':
        return `unknown NPC ${issue.npcId} referenced by ${issue.referencedBy}`;
      case 'unknown-boss':
        return `unknown boss ${issue.bossId} referenced by ${issue.referencedBy}`;
      case 'unknown-skill':
        return `unknown skill ${issue.skillId} referenced by ${issue.referencedBy}`;
      case 'invalid-spec-count':
        return `class ${issue.className} has ${issue.got} specializations (expected 2)`;
      case 'spec-wrong-class':
        return `spec ${issue.specId} declares baseClass ${issue.got} (expected ${issue.expected})`;
      case 'duplicate-quest-stage-id':
        return `quest ${issue.questId} has duplicate stage id "${issue.stageId}"`;
      case 'invalid-loot-chance':
        return `lootTable ${issue.tableId} drop ${issue.itemId} has chance ${issue.chance} (must be in [0,1])`;
      case 'non-positive-vendor-price':
        return `vendor ${issue.vendorId} sells ${issue.itemId} at price ${issue.price} (must be > 0)`;
      case 'invalid-zone-level-band':
        return `zone ${issue.zoneId} has maxLevel ${issue.maxLevel} < minLevel ${issue.minLevel}`;
      case 'race-unknown-class':
        return `race ${issue.race} allows unknown class ${issue.className}`;
      case 'class-no-allowed-race':
        return `class ${issue.className} is not playable by any race`;
      case 'unknown-quest-prereq':
        return `quest ${issue.questId} prereq references unknown quest ${issue.prereqId}`;
    }
  }).join('\n');
}
