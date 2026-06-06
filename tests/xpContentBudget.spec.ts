import { describe, expect, it } from 'vitest';
import {
  auditXpContentBudget,
  buildXpContentRows,
  MAX_BOSS_XP_TO_LEVEL_RATIO,
  MAX_MOB_XP_TO_LEVEL_RATIO,
  simulateRelevantKillXpOutcomes,
  XP_BUDGET_MAX_LEVEL,
  xpLevelBandSummaries,
  xpOffenderReportRows,
} from '../server/sim/xpContentBudget.js';

describe('XP content budget lock', () => {
  it('keeps every authored mob and mini-boss raw XP inside budget', () => {
    const rows = buildXpContentRows();
    const issues = auditXpContentBudget(rows);

    expect(issues).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.kind === 'mob')).toBe(true);
    expect(rows.some((row) => row.kind === 'boss')).toBe(true);
    expect(rows.every((row) => row.baseXp > 0)).toBe(true);
    expect(rows.every((row) => row.rawWouldSkipFromLevelStart === false)).toBe(true);
    expect(Math.max(...rows.filter((row) => row.kind === 'mob').map((row) => row.xpToLevelRatio))).toBeLessThanOrEqual(MAX_MOB_XP_TO_LEVEL_RATIO);
    expect(Math.max(...rows.filter((row) => row.kind === 'boss').map((row) => row.xpToLevelRatio))).toBeLessThanOrEqual(MAX_BOSS_XP_TO_LEVEL_RATIO);
  });

  it('simulates every relevant level kill without a single-award level skip', () => {
    const outcomes = simulateRelevantKillXpOutcomes();
    const levelsCovered = new Set(outcomes.map((row) => row.level));

    for (let level = 1; level <= XP_BUDGET_MAX_LEVEL; level += 1) {
      expect(levelsCovered.has(level), `missing authored XP coverage for L${level}`).toBe(true);
    }
    for (const row of outcomes) {
      expect(row.levelsFromZeroXp, `${row.kind}:${row.label}:L${row.level} from zero XP`).toBeLessThanOrEqual(1);
      expect(row.levelsNearThreshold, `${row.kind}:${row.label}:L${row.level} near threshold`).toBeLessThanOrEqual(1);
      expect(row.appliedFromZeroXp).toBeLessThanOrEqual(row.baseXp);
      expect(row.appliedNearThreshold).toBeLessThanOrEqual(row.baseXp);
    }
  });

  it('reports top offenders and quest plus kill XP by level band', () => {
    const rows = buildXpContentRows();
    const offenders = xpOffenderReportRows(8, rows);
    const bands = xpLevelBandSummaries(XP_BUDGET_MAX_LEVEL, rows);

    expect(offenders).toHaveLength(8);
    for (let i = 1; i < offenders.length; i += 1) {
      expect(offenders[i - 1]!.xpToLevelRatio).toBeGreaterThanOrEqual(offenders[i]!.xpToLevelRatio);
    }
    expect(offenders[0]?.kind).toBe('boss');
    expect(offenders[0]?.xpToLevelRatio).toBeGreaterThan(1);
    expect(bands).toHaveLength(Math.ceil(XP_BUDGET_MAX_LEVEL / 5));
    expect(bands.every((row) => row.questXp >= 0)).toBe(true);
    expect(bands.every((row) => row.maxKillXp >= row.maxMobXp)).toBe(true);
    expect(bands.every((row) => row.maxKillRatio <= MAX_BOSS_XP_TO_LEVEL_RATIO)).toBe(true);
  });
});
