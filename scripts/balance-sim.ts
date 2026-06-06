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
import { journeyReportRows, type PlayerJourneySummary } from '../server/sim/playerJourney.js';
import { journeyGapReportRows, type JourneyGapDiagnostic } from '../server/sim/playerJourneyGaps.js';
import {
  createSimReportContext,
  type SimContentSnapshot,
  type SimCoverageWarning,
  type SimReportContext,
} from '../server/sim/reportContext.js';
import { buildSpecializationAiAudit, type SpecializationAiCoverageRow } from '../server/sim/specializationAiAudit.js';
import { buildSkillBalanceInstrumentation, type SkillBalanceInstrumentationRow } from '../server/sim/skillBalanceInstrumentation.js';
import {
  auditXpContentBudget,
  MAX_BOSS_XP_TO_LEVEL_RATIO,
  MAX_MOB_XP_TO_LEVEL_RATIO,
  xpLevelBandSummaries,
  xpOffenderReportRows,
} from '../server/sim/xpContentBudget.js';

console.log('# VibeAge simulation balance report');
console.log('');
console.log(`Generated ${new Date().toISOString().slice(0, 10)} with the server game simulator.`);
console.log('');

const reportContext = createSimReportContext({ commitSha: gitCommitSha() });
const playerJourneyRows = journeyReportRows();
printReportScope(reportContext);
printPveClassMatrix();
printSpecializationMatrix();
printSpecializationAiAudit();
printSkillBalanceInstrumentation();
printPvpClassMatrix();
printProgressionRewards();
printXpContentBudget();
printPlayerJourneyRoutes(playerJourneyRows);
printPlayerJourneyGapDiagnostics(playerJourneyRows);
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

function printSpecializationAiAudit(): void {
  const audit = buildSpecializationAiAudit();
  console.log('## Specialization AI audit');
  console.log('');
  console.log(`Exercise rows: ${audit.totals.scenarios}. Completed: ${audit.totals.completed}/${audit.totals.scenarios}. Coverage rows: ${audit.totals.coverageRows}. Blocked casts: ${audit.totals.blockedCasts}. Reaction triggers: ${audit.totals.triggeredReactions}. Uncovered skills: ${audit.totals.uncoveredSkillSlots}. Untriggered reactions: ${audit.totals.untriggeredReactionSlots}.`);
  console.log('');
  console.log('| Spec | Lv | Role | Exercises | Skill coverage | Reactions | Uncovered skills | Untriggered reactions | Blocked casts |');
  console.log('|------|----|------|-----------|----------------|-----------|------------------|-----------------------|---------------|');
  for (const row of audit.coverageRows) {
    console.log(`| ${row.specializationId} | ${row.level} | ${row.role} | ${row.completed}/${row.exerciseCount} | ${row.coveredSkillIds.length}/${row.expectedSkillIds.length} | ${reactionCell(row)} | ${listCell(row.uncoveredSkillIds)} | ${listCell(row.untriggeredReactionIds)} | ${row.blockedCastCount} |`);
  }
  console.log('');
}

function printSkillBalanceInstrumentation(): void {
  const rows = buildSkillBalanceInstrumentation();
  console.log('## Skill balance instrumentation');
  console.log('');
  console.log('Per-spec advisory metrics from AI exercise scenarios. These are regression signals, not tuning approval: they expose burst window, control estimate, rotation variety, filler pressure, and dead AI skills while the skill catalog keeps changing.');
  console.log('');
  console.log('| Spec | Lv | Exercises | Rotation sample | Win | Duration | HP | Burst 10s | Control est | Actions/min | Unique skills | Filler | Tactics | Risks |');
  console.log('|------|----|-----------|-----------------|-----|----------|----|-----------|-------------|-------------|---------------|--------|---------|-------|');
  for (const row of rows) console.log(skillBalanceInstrumentationRow(row));
  console.log('');
}

function skillBalanceInstrumentationRow(row: SkillBalanceInstrumentationRow): string {
  const cells = [
    row.specializationId,
    String(row.level),
    String(row.exerciseCount),
    `${row.rotationEligibleExerciseCount}/${row.exerciseCount}`,
    `${Math.round(row.winRate * 100)}%`,
    seconds(row.meanDurationMs),
    `${Math.round(row.meanSurvivalPct * 100)}%`,
    String(Math.round(row.meanBurstDamageFirst10s)),
    seconds(row.meanControlUptimeMs),
    row.meanInterestingActionsPerMinute.toFixed(1),
    row.meanUniqueSkillCount.toFixed(1),
    `${Math.round(row.meanFillerCastRatio * 100)}%`,
    tacticCell(row),
    listCell(row.riskFlags),
  ];
  return `| ${cells.join(' | ')} |`;
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

function printXpContentBudget(): void {
  const issues = auditXpContentBudget();
  console.log('## XP content budget');
  console.log('');
  console.log(`Status: **${issues.length === 0 ? 'pass' : 'fail'}**. Normal mobs are capped at ${(MAX_MOB_XP_TO_LEVEL_RATIO * 100).toFixed(0)}% of same-level XP-to-next, mini-bosses at ${(MAX_BOSS_XP_TO_LEVEL_RATIO * 100).toFixed(0)}%, and no authored raw kill can skip a level from a fresh same-level player.`);
  console.log('');
  console.log('### Top raw XP ratios');
  console.log('');
  console.log('| Kind | Zone | Enemy | Lv | Raw XP | XP-to-next | Ratio | Budget |');
  console.log('|------|------|-------|----|--------|------------|-------|--------|');
  for (const row of xpOffenderReportRows()) {
    console.log(`| ${row.kind} | ${row.zoneId} | ${row.bossId ?? row.enemyType} | ${row.level} | ${Math.round(row.baseXp)} | ${row.xpToNextLevel} | ${row.xpToLevelRatio.toFixed(2)} | ${row.maxAllowedRatio.toFixed(2)} |`);
  }
  console.log('');
  console.log('### Quest + kill XP by level band');
  console.log('');
  console.log('| Band | Quests | Quest XP | Mob rows | Boss rows | Avg mob XP | Max mob XP | Avg boss XP | Max boss XP | Max kill ratio |');
  console.log('|------|--------|----------|----------|-----------|------------|------------|-------------|-------------|----------------|');
  for (const row of xpLevelBandSummaries()) {
    console.log(`| ${row.levelBand} | ${row.questCount} | ${row.questXp} | ${row.mobCount} | ${row.bossCount} | ${row.avgMobXp} | ${row.maxMobXp} | ${row.avgBossXp} | ${row.maxBossXp} | ${row.maxKillRatio.toFixed(2)} |`);
  }
  console.log('');
}

function printPlayerJourneyRoutes(rows: readonly PlayerJourneySummary[]): void {
  console.log('## Player journey routes');
  console.log('');
  console.log('Deterministic route simulation using quest order, travel distance, current class/spec AI combat timing, expected-value loot, vendor gear purchases, and hourly beat windows. This is a regression instrument; rare-drop variance, crafting route choice, party play, deaths from player error, and market behavior are still out of scope.');
  console.log('');
  console.log('| Path | Horizon | End Lv | Quests | Kills | Bosses | Gold | Gear | Purchases | Empty windows | Max gap | Travel | Combat | Deaths | Skipped quests |');
  console.log('|------|---------|--------|--------|-------|--------|------|------|-----------|---------------|---------|--------|--------|--------|----------------|');
  for (const row of rows) {
    console.log(playerJourneyRow(row));
  }
  console.log('');
}

function printPlayerJourneyGapDiagnostics(rows: readonly PlayerJourneySummary[]): void {
  console.log('## Player journey content-gap diagnostics');
  console.log('');
  console.log('Primary advisory gap per deterministic route, prioritizing empty-feeling windows before quest, gear, unlock, and grind-only gaps. These rows explain where the route goes quiet; they are not pass/fail thresholds yet.');
  console.log('');
  console.log('| Path | Horizon | Level band | Severity | Gap kind | Window | Duration | Empty windows | Detail | First mitigation |');
  console.log('|------|---------|------------|----------|----------|--------|----------|---------------|--------|------------------|');
  for (const row of journeyGapReportRows(rows)) {
    console.log(playerJourneyGapRow(row));
  }
  console.log('');
}

function playerJourneyGapRow(row: JourneyGapDiagnostic): string {
  const cells = [
    row.pathLabel,
    hours(row.horizonHours),
    row.levelBand,
    row.severity,
    row.kind,
    `${hours(row.startHour)}-${hours(row.endHour)}`,
    hours(row.durationHours),
    `${row.emptyWindows}/${row.windowCount}`,
    row.detail,
    row.mitigation,
  ];
  return `| ${cells.join(' | ')} |`;
}

function playerJourneyRow(row: PlayerJourneySummary): string {
  const cells = [
    journeyPathLabel(row),
    hours(row.horizonHours),
    String(row.endingLevel),
    String(row.questsCompleted),
    String(row.kills),
    String(row.bossKills),
    String(row.gold),
    String(row.gearScore),
    String(row.vendorPurchases.length),
    `${row.emptyWindowCount}/${row.windows.length}`,
    hours(row.maxMeaningfulGapHours),
    hours(row.time.travelMs / (60 * 60 * 1000)),
    hours(row.time.combatMs / (60 * 60 * 1000)),
    String(row.deaths),
    listCell(row.skippedQuestIds),
  ];
  return `| ${cells.join(' | ')} |`;
}

function journeyPathLabel(row: PlayerJourneySummary): string {
  if (row.requestedSpecializationId) return row.requestedSpecializationId;
  return row.chosenSpecializationId ? `${row.className} route (${row.chosenSpecializationId})` : `${row.className} route`;
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

function reactionCell(row: SpecializationAiCoverageRow): string {
  return row.triggeredReactionIds.join(', ') || '-';
}

function tacticCell(row: SkillBalanceInstrumentationRow): string {
  return Object.entries(row.tacticCounts)
    .filter(([, count]) => count > 0)
    .map(([tactic, count]) => `${tactic}:${count}`)
    .join(', ') || '-';
}

function listCell(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : '-';
}

function healthPct(entity: { health: number; maxHealth: number }): string {
  if (entity.maxHealth <= 0) return '0%';
  return `${Math.max(0, (entity.health / entity.maxHealth) * 100).toFixed(0)}%`;
}

function gitCommitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    return sha || 'unknown';
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
