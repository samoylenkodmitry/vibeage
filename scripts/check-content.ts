import { validateWorldContent } from '../packages/content/worldContentValidation.js';
import { auditXpContentBudget, xpOffenderReportRows } from '../server/sim/xpContentBudget.js';

const result = validateWorldContent();
const xpIssues = auditXpContentBudget();
const topXpRows = xpOffenderReportRows(3);

console.log('World content check');
console.log(`zones=${result.spawnBudget.zoneCount}/${result.spawnBudget.maxZoneCount}`);
console.log(`initialEnemies=${result.spawnBudget.configuredMaxInitialEnemySpawns}/${result.spawnBudget.maxInitialEnemySpawns}`);
console.log(`enemiesPerZone=${result.spawnBudget.configuredMaxEnemiesPerZone}/${result.spawnBudget.maxEnemiesPerZone}`);
console.log(`xpBudgetIssues=${xpIssues.length}`);
console.log(`topXpRatios=${topXpRows.map((row) => `${row.kind}:${row.enemyType}@L${row.level}=${row.xpToLevelRatio.toFixed(2)}`).join(', ')}`);

if (!result.ok || xpIssues.length > 0) {
  console.error('\nContent issues:');
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  for (const issue of xpIssues) {
    console.error(`- ${issue.message} (${issue.row.zoneId}/${issue.row.enemyType})`);
  }
  process.exit(1);
}

console.log('Content OK');
