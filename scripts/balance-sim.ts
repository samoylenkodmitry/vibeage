/**
 * Scenario-level balance report.
 *
 * This sits above `server/sim/gameSimulator`: scenarios choose content,
 * teams, and player policies; the simulator runs the real combat/movement/AI
 * engine on a virtual clock and returns metrics. Output is Markdown for PRs.
 *
 * Run: `pnpm run balance:sim`.
 */
import { ENEMY_TEMPLATES } from '../packages/content/enemies.js';
import {
  gearSetMilestones,
  pveClassScenarios,
  pveSpecializationScenarios,
  pvpClassScenarios,
  questRewardMilestones,
  runPveScenario,
  runPvpScenario,
  expectedGoldForLootTable,
} from '../server/sim/scenarioCatalog.js';

console.log('# VibeAge simulation balance report');
console.log('');
console.log(`Generated ${new Date().toISOString().slice(0, 10)} with the server game simulator.`);
console.log('');

printPveClassMatrix();
printSpecializationMatrix();
printPvpClassMatrix();
printProgressionRewards();
printGearMilestones();
printLootGold();

function printPveClassMatrix(): void {
  console.log('## PvE class matrix');
  console.log('');
  console.log('| Scenario | Winner | Duration | Player HP | XP gained | Levels gained |');
  console.log('|----------|--------|----------|-----------|-----------|---------------|');
  for (const scenario of pveClassScenarios()) {
    const result = runPveScenario(scenario);
    const player = Object.values(result.summary.players)[0];
    console.log(
      `| ${scenario.className} L${scenario.level} vs ${scenario.enemyType} L${scenario.enemyLevel} | ${winner(result.summary.winnerTeamId, result.timedOut)} | ${seconds(result.durationMs)} | ${healthPct(player)} | ${Math.round(player.xpGained)} | ${player.levelsGained} |`,
    );
  }
  console.log('');
}

function printSpecializationMatrix(): void {
  console.log('## Specialization PvE smoke matrix');
  console.log('');
  console.log('| Spec | Lv | Winner | Duration | HP |');
  console.log('|------|----|--------|----------|----|');
  for (const scenario of pveSpecializationScenarios()) {
    const result = runPveScenario(scenario);
    const player = Object.values(result.summary.players)[0];
    console.log(
      `| ${scenario.specializationId} | ${scenario.level} | ${winner(result.summary.winnerTeamId, result.timedOut)} | ${seconds(result.durationMs)} | ${healthPct(player)} |`,
    );
  }
  console.log('');
}

function printPvpClassMatrix(): void {
  console.log('## PvP class matrix');
  console.log('');
  console.log('| Red | Blue | Winner | Duration |');
  console.log('|-----|------|--------|----------|');
  for (const scenario of pvpClassScenarios()) {
    const result = runPvpScenario(scenario);
    console.log(`| ${scenario.red.className} | ${scenario.blue.className} | ${winner(result.summary.winnerTeamId, result.timedOut)} | ${seconds(result.durationMs)} |`);
  }
  console.log('');
}

function printProgressionRewards(): void {
  console.log('## Quest reward milestones');
  console.log('');
  console.log('| Up to Lv | Quests | Total XP | Total gold | Reward items |');
  console.log('|----------|--------|----------|------------|--------------|');
  for (const milestone of questRewardMilestones()) {
    console.log(`| ${milestone.level} | ${milestone.questCount} | ${milestone.totalXp} | ${milestone.totalGold} | ${milestone.rewardItems.join(', ') || '-'} |`);
  }
  console.log('');
}

function printGearMilestones(): void {
  console.log('## Gear set checkpoints');
  console.log('');
  console.log('| Set | Grade | Pieces |');
  console.log('|-----|-------|--------|');
  for (const set of gearSetMilestones()) {
    console.log(`| ${set.name} | ${set.grade} | ${set.pieceNames.join(', ')} |`);
  }
  console.log('');
}

function printLootGold(): void {
  console.log('## Expected gold per kill by mob loot table');
  console.log('');
  console.log('| Mob | Loot table | Expected gold |');
  console.log('|-----|------------|---------------|');
  for (const [type, template] of Object.entries(ENEMY_TEMPLATES)) {
    const tableId = template.lootTableId ?? `${type}_loot`;
    const expectedGold = expectedGoldForLootTable(tableId);
    if (expectedGold <= 0) continue;
    console.log(`| ${template.displayName} | ${tableId} | ${expectedGold.toFixed(1)} |`);
  }
  console.log('');
}

function winner(winnerTeamId: string | null, timedOut: boolean): string {
  if (timedOut) return 'timeout';
  return winnerTeamId ?? 'draw';
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function healthPct(entity: { health: number; maxHealth: number }): string {
  if (entity.maxHealth <= 0) return '0%';
  return `${Math.max(0, (entity.health / entity.maxHealth) * 100).toFixed(0)}%`;
}
