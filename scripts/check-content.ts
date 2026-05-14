import { validateWorldContent } from '../packages/content/worldContentValidation.js';

const result = validateWorldContent();

console.log('World content check');
console.log(`zones=${result.spawnBudget.zoneCount}/${result.spawnBudget.maxZoneCount}`);
console.log(`initialEnemies=${result.spawnBudget.configuredMaxInitialEnemySpawns}/${result.spawnBudget.maxInitialEnemySpawns}`);
console.log(`enemiesPerZone=${result.spawnBudget.configuredMaxEnemiesPerZone}/${result.spawnBudget.maxEnemiesPerZone}`);

if (!result.ok) {
  console.error('\nContent issues:');
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Content OK');
