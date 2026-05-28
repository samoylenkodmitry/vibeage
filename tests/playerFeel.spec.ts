import { describe, expect, it } from 'vitest';
import {
  estimateFeelForClasses,
  estimateFeelForSpecializations,
  estimatePlayerFeel,
} from '../server/sim/playerFeel';

describe('player feel cadence metrics', () => {
  it('summarizes meaningful beats for a one-hour play window', () => {
    const summary = estimatePlayerFeel({ className: 'mage', horizonHours: 1 });

    expect(summary.className).toBe('mage');
    expect(summary.horizonHours).toBe(1);
    expect(summary.windowCount).toBe(1);
    expect(summary.kills).toBeGreaterThan(0);
    expect(summary.beatCounts.skill).toBeGreaterThan(0);
    expect(summary.feelScore).toBeGreaterThanOrEqual(0);
    expect(summary.feelScore).toBeLessThanOrEqual(100);
    expect(summary.windows).toHaveLength(1);
    expect(summary.windows[0]?.beatWeight).toBeGreaterThan(0);
  });

  it('flags long stretches without progression beats as empty', () => {
    const summary = estimatePlayerFeel({
      className: 'warrior',
      horizonHours: 4,
      windowHours: 1,
      killOverheadMs: 60 * 60 * 1000,
    });

    expect(summary.emptyRisk).toBe('high');
    expect(summary.emptyWindowCount).toBeGreaterThan(0);
    expect(summary.longestEmptyWindowStreak).toBeGreaterThan(0);
    expect(summary.mitigationHints.join(' ')).toContain('Fill empty windows');
  });

  it('includes already-earned skills, quests, and specialization when starting midgame', () => {
    const summary = estimatePlayerFeel({
      className: 'mage',
      specializationId: 'pyromancer',
      startingLevel: 20,
      horizonHours: 1,
    });

    expect(summary.beatCounts.specialization).toBeGreaterThan(0);
    expect(summary.beats.some((beat) => beat.label.includes('fireball'))).toBe(true);
    expect(summary.beats.some((beat) => beat.label.includes('meteor'))).toBe(true);
    expect(summary.beatCounts.quest).toBeGreaterThan(0);
  });

  it('builds cadence rows for every class at requested horizons', () => {
    const rows = estimateFeelForClasses([1, 24]);

    expect(rows).toHaveLength(14);
    expect(new Set(rows.map((row) => row.className))).toEqual(
      new Set(['mage', 'warrior', 'healer', 'ranger', 'knight', 'paladin', 'rogue']),
    );
  });

  it('builds cadence rows for every specialization path', () => {
    const rows = estimateFeelForSpecializations([24, 168]);

    expect(rows).toHaveLength(28);
    expect(rows.every((row) => row.specializationId)).toBe(true);
    expect(new Set(rows.map((row) => row.specializationId)).size).toBe(14);
  });
});
