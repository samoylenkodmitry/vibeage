import { ENEMY_BASE_SCALING, getEnemyTemplate } from '../../packages/content/enemies.js';
import { QUESTS } from '../../packages/content/quests.js';
import { GAME_ZONES, type Zone, type ZoneMiniBoss, type ZoneMob } from '../../packages/content/zones.js';
import { capSingleLevelAwardXP, getExperienceToNextLevel } from '../players/playerProgression.js';

export const XP_BUDGET_MAX_LEVEL = 40;
export const XP_BUDGET_BAND_SIZE = 5;
export const MAX_MOB_XP_TO_LEVEL_RATIO = 0.55;
export const MAX_BOSS_XP_TO_LEVEL_RATIO = 1.6;

export type XpContentRowKind = 'mob' | 'boss';

export type XpContentRow = {
  kind: XpContentRowKind;
  zoneId: string;
  zoneName: string;
  enemyType: string;
  bossId?: string;
  label: string;
  level: number;
  baseXp: number;
  xpToNextLevel: number;
  nextLevelXpToNextLevel: number;
  maxRawXpWithoutSkippingFromLevelStart: number;
  xpToLevelRatio: number;
  maxAllowedRatio: number;
  rawWouldSkipFromLevelStart: boolean;
};

export type XpBudgetIssue = {
  severity: 'error';
  row: XpContentRow;
  message: string;
};

export type XpKillSimulationRow = XpContentRow & {
  appliedFromZeroXp: number;
  levelsFromZeroXp: number;
  appliedNearThreshold: number;
  levelsNearThreshold: number;
};

export type XpLevelBandSummary = {
  levelBand: string;
  minLevel: number;
  maxLevel: number;
  questCount: number;
  questXp: number;
  mobCount: number;
  bossCount: number;
  maxMobXp: number;
  maxBossXp: number;
  maxKillXp: number;
  avgMobXp: number;
  avgBossXp: number;
  maxKillRatio: number;
};

export function buildXpContentRows(zones: readonly Zone[] = GAME_ZONES): XpContentRow[] {
  return zones.flatMap((zone) => [
    ...zone.mobs.flatMap((mob) => mobRows(zone, mob)),
    ...(zone.miniBoss ? bossRows(zone, zone.miniBoss) : []),
  ]);
}

export function auditXpContentBudget(rows: readonly XpContentRow[] = buildXpContentRows()): XpBudgetIssue[] {
  const issues: XpBudgetIssue[] = [];
  for (const row of rows) {
    if (row.rawWouldSkipFromLevelStart) {
      issues.push({
        severity: 'error',
        row,
        message: `${row.label} L${row.level} raw XP ${row.baseXp} can skip a level from a fresh L${row.level}`,
      });
    }
    if (row.xpToLevelRatio > row.maxAllowedRatio) {
      issues.push({
        severity: 'error',
        row,
        message: `${row.label} L${row.level} XP ratio ${row.xpToLevelRatio.toFixed(2)} exceeds ${row.maxAllowedRatio.toFixed(2)}`,
      });
    }
  }
  return issues;
}

export function xpOffenderReportRows(limit = 12, rows: readonly XpContentRow[] = buildXpContentRows()): XpContentRow[] {
  return [...rows]
    .sort((a, b) => (
      b.xpToLevelRatio - a.xpToLevelRatio
      || b.baseXp - a.baseXp
      || a.zoneId.localeCompare(b.zoneId)
      || a.label.localeCompare(b.label)
    ))
    .slice(0, limit);
}

export function simulateRelevantKillXpOutcomes(
  maxLevel = XP_BUDGET_MAX_LEVEL,
  rows: readonly XpContentRow[] = buildXpContentRows(),
): XpKillSimulationRow[] {
  return rows
    .filter((row) => row.level <= maxLevel)
    .map((row) => {
      const fromZero = simulateCappedAward(row.level, 0, row.baseXp);
      const nearThresholdExperience = Math.max(0, row.xpToNextLevel - 1);
      const nearThreshold = simulateCappedAward(row.level, nearThresholdExperience, row.baseXp);
      return {
        ...row,
        appliedFromZeroXp: fromZero.appliedXp,
        levelsFromZeroXp: fromZero.levelsGained,
        appliedNearThreshold: nearThreshold.appliedXp,
        levelsNearThreshold: nearThreshold.levelsGained,
      };
    });
}

export function xpLevelBandSummaries(
  maxLevel = XP_BUDGET_MAX_LEVEL,
  rows: readonly XpContentRow[] = buildXpContentRows(),
): XpLevelBandSummary[] {
  const summaries: XpLevelBandSummary[] = [];
  for (let minLevel = 1; minLevel <= maxLevel; minLevel += XP_BUDGET_BAND_SIZE) {
    const maxBandLevel = Math.min(maxLevel, minLevel + XP_BUDGET_BAND_SIZE - 1);
    const inBand = rows.filter((row) => row.level >= minLevel && row.level <= maxBandLevel);
    const mobs = inBand.filter((row) => row.kind === 'mob');
    const bosses = inBand.filter((row) => row.kind === 'boss');
    const quests = Object.values(QUESTS).filter((quest) => quest.minLevel >= minLevel && quest.minLevel <= maxBandLevel);
    const maxMobXp = max(mobs.map((row) => row.baseXp));
    const maxBossXp = max(bosses.map((row) => row.baseXp));
    summaries.push({
      levelBand: `L${minLevel}-${maxBandLevel}`,
      minLevel,
      maxLevel: maxBandLevel,
      questCount: quests.length,
      questXp: sum(quests.map((quest) => quest.reward.xp ?? 0)),
      mobCount: mobs.length,
      bossCount: bosses.length,
      maxMobXp,
      maxBossXp,
      maxKillXp: Math.max(maxMobXp, maxBossXp),
      avgMobXp: roundedAverage(mobs.map((row) => row.baseXp)),
      avgBossXp: roundedAverage(bosses.map((row) => row.baseXp)),
      maxKillRatio: roundMetric(max(inBand.map((row) => row.xpToLevelRatio))),
    });
  }
  return summaries;
}

function mobRows(zone: Zone, mob: ZoneMob): XpContentRow[] {
  const rows: XpContentRow[] = [];
  for (let level = zone.minLevel; level <= zone.maxLevel; level += 1) {
    rows.push(xpContentRow({
      kind: 'mob',
      zone,
      enemyType: mob.type,
      level,
      label: `${getEnemyTemplate(mob.type).displayName}`,
    }));
  }
  return rows;
}

function bossRows(zone: Zone, boss: ZoneMiniBoss): XpContentRow[] {
  const rows: XpContentRow[] = [];
  const levelBonus = boss.levelBonus ?? 2;
  for (let baseLevel = zone.minLevel; baseLevel <= zone.maxLevel; baseLevel += 1) {
    rows.push(xpContentRow({
      kind: 'boss',
      zone,
      enemyType: boss.type,
      bossId: boss.id,
      level: baseLevel + levelBonus,
      label: boss.name,
    }));
  }
  return rows;
}

function xpContentRow(input: {
  kind: XpContentRowKind;
  zone: Zone;
  enemyType: string;
  bossId?: string;
  level: number;
  label: string;
}): XpContentRow {
  const baseXp = enemyRawXp(input.enemyType, input.level, input.kind === 'boss' ? 4 : 1);
  const xpToNextLevel = getExperienceToNextLevel(input.level);
  const nextLevelXpToNextLevel = getExperienceToNextLevel(input.level + 1);
  const maxRawXpWithoutSkippingFromLevelStart = xpToNextLevel + nextLevelXpToNextLevel - 1;
  return {
    kind: input.kind,
    zoneId: input.zone.id,
    zoneName: input.zone.name,
    enemyType: input.enemyType,
    bossId: input.bossId,
    label: input.label,
    level: input.level,
    baseXp,
    xpToNextLevel,
    nextLevelXpToNextLevel,
    maxRawXpWithoutSkippingFromLevelStart,
    xpToLevelRatio: baseXp / xpToNextLevel,
    maxAllowedRatio: input.kind === 'boss' ? MAX_BOSS_XP_TO_LEVEL_RATIO : MAX_MOB_XP_TO_LEVEL_RATIO,
    rawWouldSkipFromLevelStart: baseXp > maxRawXpWithoutSkippingFromLevelStart,
  };
}

function enemyRawXp(enemyType: string, level: number, experienceMultiplier: number): number {
  const template = getEnemyTemplate(enemyType);
  const scale = ENEMY_BASE_SCALING.experience;
  return (scale.flat + level * scale.perLevel) * template.stats.experience * experienceMultiplier;
}

function simulateCappedAward(level: number, experience: number, rawXp: number): { appliedXp: number; levelsGained: number } {
  const appliedXp = capSingleLevelAwardXP({ level, experience, experienceToNextLevel: getExperienceToNextLevel(level) }, rawXp);
  let nextLevel = level;
  let nextExperience = experience + appliedXp;
  while (nextExperience >= getExperienceToNextLevel(nextLevel)) {
    nextExperience -= getExperienceToNextLevel(nextLevel);
    nextLevel += 1;
  }
  return { appliedXp, levelsGained: nextLevel - level };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function max(values: readonly number[]): number {
  return values.reduce((highest, value) => (value > highest ? value : highest), 0);
}

function roundedAverage(values: readonly number[]): number {
  return values.length === 0 ? 0 : roundMetric(sum(values) / values.length);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
