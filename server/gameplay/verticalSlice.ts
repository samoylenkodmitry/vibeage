import { ITEMS } from '../../packages/content/items.js';
import {
  STARTER_VERTICAL_SLICE,
  getStarterVerticalSliceSkills,
  getStarterVerticalSliceZone,
  inspectStarterVerticalSliceContent,
} from '../../packages/content/verticalSlice.js';
import { createEnemy } from '../enemies/enemyLifecycle.js';
import { LOOT_TABLES } from '../../packages/content/lootTables.js';

export type StarterVerticalSliceValidation = {
  ok: boolean;
  issues: string[];
  lootTableIds: string[];
};

export function validateStarterVerticalSlice(): StarterVerticalSliceValidation {
  const issues: string[] = [];
  const zone = getStarterVerticalSliceZone();
  const content = inspectStarterVerticalSliceContent();
  const lootTableIds = STARTER_VERTICAL_SLICE.enemyTypes.map((enemyType) => `${enemyType}_loot`);

  collectContentIssues(issues, content);
  collectZoneIssues(issues, zone);
  collectSkillIssues(issues);
  collectLootIssues(issues, lootTableIds);
  collectEnemyRuntimeIssues(issues);

  return {
    ok: issues.length === 0,
    issues,
    lootTableIds,
  };
}

function collectContentIssues(
  issues: string[],
  content: ReturnType<typeof inspectStarterVerticalSliceContent>,
): void {
  for (const skillId of content.missingSkills) {
    issues.push(`missing starter skill: ${skillId}`);
  }

  for (const enemyType of content.missingEnemyTypes) {
    issues.push(`starter zone does not spawn ${enemyType}`);
  }
}

function collectZoneIssues(
  issues: string[],
  zone: ReturnType<typeof getStarterVerticalSliceZone>,
): void {
  if (zone.minLevel !== STARTER_VERTICAL_SLICE.levelRange.min) {
    issues.push(`starter zone min level must be ${STARTER_VERTICAL_SLICE.levelRange.min}`);
  }

  if (zone.maxLevel !== STARTER_VERTICAL_SLICE.levelRange.max) {
    issues.push(`starter zone max level must be ${STARTER_VERTICAL_SLICE.levelRange.max}`);
  }
}

function collectSkillIssues(issues: string[]): void {
  for (const skill of getStarterVerticalSliceSkills()) {
    if (!skill) {
      continue;
    }

    if (skill.levelRequired > STARTER_VERTICAL_SLICE.levelRange.max) {
      issues.push(`${skill.id} requires level ${skill.levelRequired}, outside starter slice`);
    }
  }
}

function collectLootIssues(issues: string[], lootTableIds: string[]): void {
  for (const tableId of lootTableIds) {
    const table = LOOT_TABLES[tableId];
    if (!table || table.drops.length === 0) {
      issues.push(`missing loot table drops: ${tableId}`);
      continue;
    }

    for (const drop of table.drops) {
      if (!ITEMS[drop.itemId]) {
        issues.push(`${tableId} references missing item ${drop.itemId}`);
      }
    }
  }
}

function collectEnemyRuntimeIssues(issues: string[]): void {
  for (const enemyType of STARTER_VERTICAL_SLICE.enemyTypes) {
    const enemy = createEnemy(enemyType, 1, { x: 0, y: 0.5, z: 0 }, 1);
    if (!enemy.lootTableId || !LOOT_TABLES[enemy.lootTableId]) {
      issues.push(`${enemyType} creates missing loot table ${enemy.lootTableId}`);
    }

    if (enemy.experienceValue <= 0) {
      issues.push(`${enemyType} must grant experience`);
    }
  }
}
