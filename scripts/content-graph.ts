/**
 * §49/M1 PR002 — content graph CLI.
 *
 * Single command (`pnpm run content:graph`) that walks every content
 * registry, checks every cross-reference, prints a designer report,
 * and exits non-zero when something is broken — same validator the
 * vitest `contentGraph.spec.ts` test wraps, but with human-readable
 * counts and grouped output for design review and CI logs.
 */
import { CHARACTER_RACES } from '../packages/content/races.js';
import { CLASS_SKILL_TREES } from '../packages/content/classes.js';
import { SPECIALIZATIONS, SPECIALIZATION_UNLOCK_LEVEL, PROFICIENCY_LEVEL } from '../packages/content/specializations.js';
import { SKILLS } from '../packages/content/skills.js';
import { ITEMS } from '../packages/content/items.js';
import { QUESTS } from '../packages/content/quests.js';
import { QUEST_NPCS } from '../packages/content/npcs.js';
import { VENDORS } from '../packages/content/vendors.js';
import { LOOT_TABLES } from '../packages/content/lootTables.js';
import { ENEMY_TEMPLATES } from '../packages/content/enemies.js';
import { GAME_ZONES } from '../packages/content/zones.js';
import { MINI_BOSSES } from '../packages/content/miniBosses.js';
import {
  formatContentGraphIssues,
  validateContentGraph,
  type ContentGraphIssue,
} from '../packages/content/obtainability.js';

const counts = {
  races: CHARACTER_RACES.length,
  classes: Object.keys(CLASS_SKILL_TREES).length,
  specializations: Object.keys(SPECIALIZATIONS).length,
  skills: Object.keys(SKILLS).length,
  items: Object.keys(ITEMS).length,
  quests: Object.keys(QUESTS).length,
  npcs: Object.keys(QUEST_NPCS).length,
  vendors: Object.keys(VENDORS).length,
  lootTables: Object.keys(LOOT_TABLES).length,
  enemies: Object.keys(ENEMY_TEMPLATES).length,
  zones: GAME_ZONES.length,
  miniBosses: Object.keys(MINI_BOSSES).length,
};

console.log('VibeAge content graph');
console.log('---------------------');
console.log(`races=${counts.races}  classes=${counts.classes}  specs=${counts.specializations}`);
console.log(`skills=${counts.skills}  items=${counts.items}  quests=${counts.quests}`);
console.log(`npcs=${counts.npcs}  vendors=${counts.vendors}  lootTables=${counts.lootTables}`);
console.log(`enemies=${counts.enemies}  zones=${counts.zones}  miniBosses=${counts.miniBosses}`);
console.log(`specialization unlock @L${SPECIALIZATION_UNLOCK_LEVEL}, proficiency @L${PROFICIENCY_LEVEL}`);
console.log('');

const issues = validateContentGraph();
const grouped = groupByKind(issues);

if (issues.length === 0) {
  console.log('No issues found.');
  process.exit(0);
}

console.error(`Content graph: ${issues.length} issue(s)`);
for (const [kind, group] of grouped) {
  console.error(`\n[${kind}] (${group.length})`);
  console.error(formatContentGraphIssues(group).split('\n').map((l) => `  ${l}`).join('\n'));
}
process.exit(1);

function groupByKind(all: ContentGraphIssue[]): Map<ContentGraphIssue['kind'], ContentGraphIssue[]> {
  const map = new Map<ContentGraphIssue['kind'], ContentGraphIssue[]>();
  for (const issue of all) {
    const bucket = map.get(issue.kind);
    if (bucket) bucket.push(issue);
    else map.set(issue.kind, [issue]);
  }
  return map;
}
