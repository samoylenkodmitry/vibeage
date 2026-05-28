/**
 * Scenario-level balance report.
 *
 * This sits above `server/sim/gameSimulator`: scenarios choose content,
 * teams, and player policies; the simulator runs the real combat/movement/AI
 * engine on a virtual clock and returns metrics. Output is Markdown for PRs.
 *
 * Run: `pnpm run balance:sim`.
 */
import { execFileSync } from 'node:child_process';
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
import {
  estimateFeelForClasses,
  estimateFeelForSpecializations,
  type PlayerFeelSummary,
} from '../server/sim/playerFeel.js';
import {
  createSimReportContext,
  type SimContentSnapshot,
  type SimCoverageWarning,
  type SimReportContext,
} from '../server/sim/reportContext.js';

console.log('# VibeAge simulation balance report');
console.log('');
console.log(`Generated ${new Date().toISOString().slice(0, 10)} with the server game simulator.`);
console.log('');

const reportContext = createSimReportContext({ commitSha: gitCommitSha() });
printReportScope(reportContext);
printPveClassMatrix();
printSpecializationMatrix();
printPvpClassMatrix();
printProgressionRewards();
printPlayerFeelCadence();
printGearMilestones();
printLootGold();

function printReportScope(context: SimReportContext): void {
  console.log('## Report scope');
  console.log('');
  console.log(`Status: **${context.status} / advisory**.`);
  for (const assumption of context.assumptions) {
    console.log(`- ${assumption}`);
  }
  console.log('');
  printContentSnapshot(context.snapshot);
  printCoverageWarnings(context.warnings);
}

function printContentSnapshot(snapshot: SimContentSnapshot): void {
  console.log('### Content snapshot');
  console.log('');
  console.log(`Commit: \`${snapshot.commitSha}\``);
  console.log('');
  console.log('| Catalog | Count |');
  console.log('|---------|-------|');
  for (const [label, value] of contentSnapshotRows(snapshot)) {
    console.log(`| ${label} | ${value} |`);
  }
  console.log('');
}

function printCoverageWarnings(warnings: readonly SimCoverageWarning[]): void {
  console.log('### Advisory coverage warnings');
  console.log('');
  console.log('| Severity | Warning |');
  console.log('|----------|---------|');
  for (const warning of warnings) {
    console.log(`| ${warning.severity} | ${warning.message} |`);
  }
  console.log('');
}

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

function printPlayerFeelCadence(): void {
  console.log('## Player feel cadence');
  console.log('');
  console.log('Meaningful beats are level-ups, skill/passive unlocks, quest unlocks, specialization choices, and proficiency unlocks. Base rows show no chosen spec; spec rows assume that spec is picked at level 20. The target window defaults to one hour; empty windows and long dry gaps are balance risks.');
  console.log('');
  console.log('| Path | Horizon | End Lv | Kills/hr | Score | Beats/window | Empty windows | Max gap | Risk | First mitigation |');
  console.log('|------|---------|--------|----------|-------|--------------|---------------|---------|------|------------------|');
  const summaries = [
    ...estimateFeelForClasses([1, 24, 168, 720]),
    ...estimateFeelForSpecializations([24, 168, 720]),
  ];
  for (const summary of summaries) {
    console.log(playerFeelRow(summary));
  }
  console.log('');
}

function playerFeelRow(summary: PlayerFeelSummary): string {
  const cells = [
    summary.specializationId ?? `${summary.className} base`,
    hours(summary.horizonHours),
    String(summary.endingLevel),
    summary.killsPerHour.toFixed(1),
    String(summary.feelScore),
    summary.meaningfulBeatsPerWindow.toFixed(1),
    `${summary.emptyWindowCount}/${summary.windowCount}`,
    hours(summary.maxMeaningfulGapHours),
    summary.emptyRisk,
    summary.mitigationHints[0] ?? '-',
  ];
  return `| ${cells.join(' | ')} |`;
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

function hours(value: number): string {
  if (value < 24) return `${value.toFixed(value < 10 && value % 1 !== 0 ? 1 : 0)}h`;
  if (value < 24 * 14) return `${(value / 24).toFixed(1)}d`;
  return `${(value / (24 * 30)).toFixed(1)}mo`;
}

function healthPct(entity: { health: number; maxHealth: number }): string {
  if (entity.maxHealth <= 0) return '0%';
  return `${Math.max(0, (entity.health / entity.maxHealth) * 100).toFixed(0)}%`;
}

function gitCommitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function contentSnapshotRows(snapshot: SimContentSnapshot): Array<[string, number]> {
  return [
    ['Classes', snapshot.classes],
    ['Specializations', snapshot.specializations],
    ['Skills', snapshot.skills],
    ['Active skills', snapshot.activeSkills],
    ['Passive skills', snapshot.passiveSkills],
    ['Effects', snapshot.effects],
    ['Actions', snapshot.actions],
    ['Items', snapshot.items],
    ['Quests', snapshot.quests],
    ['Enemies', snapshot.enemies],
    ['Zones', snapshot.zones],
    ['NPCs', snapshot.npcs],
    ['Vendors', snapshot.vendors],
    ['Loot tables', snapshot.lootTables],
    ['Gear sets', snapshot.gearSets],
    ['Mini-bosses', snapshot.miniBosses],
    ['Races', snapshot.races],
    ['Sim policy profiles', snapshot.simPolicyProfiles],
  ];
}
