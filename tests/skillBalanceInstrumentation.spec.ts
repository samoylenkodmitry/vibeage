import { describe, expect, it } from 'vitest';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { buildSkillBalanceInstrumentation } from '../server/sim/skillBalanceInstrumentation';

describe('skill balance instrumentation', () => {
  it('aggregates burst, control, cadence, and tactic rows for every specialization level', () => {
    const rows = buildSkillBalanceInstrumentation();

    expect(rows).toHaveLength(Object.keys(SPECIALIZATIONS).length * 2);
    for (const row of rows) {
      expect(row.exerciseCount, row.id).toBeGreaterThan(3);
      expect(row.winRate, row.id).toBeGreaterThan(0);
      expect(row.meanDurationMs, row.id).toBeGreaterThan(0);
      expect(row.meanSurvivalPct, row.id).toBeGreaterThanOrEqual(0);
      expect(row.meanSurvivalPct, row.id).toBeLessThanOrEqual(1);
      expect(row.meanInterestingActionsPerMinute, row.id).toBeGreaterThan(0);
      expect(row.meanUniqueSkillCount, row.id).toBeGreaterThan(0);
      expect(row.meanFillerCastRatio, row.id).toBeGreaterThanOrEqual(0);
      expect(row.meanFillerCastRatio, row.id).toBeLessThanOrEqual(1);
      expect(row.rotationEligibleExerciseCount, row.id).toBeGreaterThanOrEqual(0);
      expect(row.shortFightExerciseCount + row.rotationEligibleExerciseCount, row.id).toBe(row.exerciseCount);
      expect(Object.values(row.tacticCounts).reduce((total, count) => total + count, 0), row.id).toBeGreaterThan(0);
      expect(row.deadSkillIds, row.id).toEqual([]);
    }
  });
});
