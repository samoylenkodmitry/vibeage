import { describe, expect, it } from 'vitest';
import {
  auditEconomyProgressionBudget,
  bestEquipScoreByLevel,
  buildJourneyEconomyRows,
  buildJourneyGearCheckpointRows,
  buildLootEconomyRows,
  buildQuestGoldBudgetRows,
  economyLevelBandSummaries,
  economyOffenderReportRows,
  ECONOMY_BUDGET_MAX_LEVEL,
  questGoldOffenderReportRows,
} from '../server/sim/economyProgressionBudget.js';
import { journeyReportRows } from '../server/sim/playerJourney.js';

describe('economy and progression budget', () => {
  it('keeps authored mob, boss, and quest rewards within budget', () => {
    const lootRows = buildLootEconomyRows();
    const questRows = buildQuestGoldBudgetRows();
    const issues = auditEconomyProgressionBudget({
      lootRows,
      questRows,
      journeyRows: [],
      gearRows: [],
    });

    expect(lootRows.length).toBeGreaterThan(0);
    expect(questRows.length).toBeGreaterThan(0);
    expect(issues.filter((issue) => issue.severity === 'error'), issues.map((issue) => issue.message).join('\n')).toEqual([]);
  });

  it('locks one-day journey economy, gear checkpoints, and empty-window cadence', () => {
    const journeyRows = journeyReportRows();
    const economyRows = buildJourneyEconomyRows(journeyRows);
    const gearRows = buildJourneyGearCheckpointRows(journeyRows);
    const issues = auditEconomyProgressionBudget({
      lootRows: [],
      questRows: [],
      journeyRows: economyRows,
      gearRows,
    });

    expect(economyRows.length).toBe(journeyRows.length);
    for (const row of economyRows) {
      expect(row.endingLevel, row.pathId).toBe(ECONOMY_BUDGET_MAX_LEVEL);
      expect(row.skippedLevelCount, row.pathId).toBe(0);
      expect(row.obsoleteQuestCount, row.pathId).toBe(0);
      expect(row.emptyWindowCount, row.pathId).toBe(0);
      expect(row.purchaseCount, row.pathId).toBeGreaterThan(0);
      expect(row.gearScore, row.pathId).toBeGreaterThan(0);
    }
    expect(gearRows.some((row) => row.checkpointLevel === ECONOMY_BUDGET_MAX_LEVEL && row.gearScore >= 250)).toBe(true);
    expect(issues, issues.map((issue) => issue.message).join('\n')).toEqual([]);
  });

  it('exposes deterministic offender and level-band report rows', () => {
    const lootRows = economyOffenderReportRows(5);
    const questRows = questGoldOffenderReportRows(5);
    const bands = economyLevelBandSummaries();
    const bestGear = bestEquipScoreByLevel(40);

    expect(lootRows).toHaveLength(5);
    expect(questRows).toHaveLength(5);
    expect(bands).toHaveLength(8);
    for (let i = 1; i < lootRows.length; i += 1) {
      expect(lootRows[i - 1]!.expectedValueRatio).toBeGreaterThanOrEqual(lootRows[i]!.expectedValueRatio);
    }
    for (let i = 1; i < questRows.length; i += 1) {
      expect(questRows[i - 1]!.goldRatio).toBeGreaterThanOrEqual(questRows[i]!.goldRatio);
    }
    expect(Object.keys(bestGear).length).toBeGreaterThan(6);
    expect(bands.at(-1)?.levelBand).toBe('L36-40');
  });

  it('keeps best available gear score non-decreasing through progression checkpoints', () => {
    const scores = [5, 10, 20, 30, 40].map((level) => ({
      level,
      score: Object.values(bestEquipScoreByLevel(level)).reduce((total, slot) => total + (slot?.score ?? 0), 0),
    }));

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]!.score, `L${scores[index]!.level}`).toBeGreaterThanOrEqual(scores[index - 1]!.score);
    }
    expect(scores.at(-1)!.score).toBeGreaterThan(scores[0]!.score);
  });
});
