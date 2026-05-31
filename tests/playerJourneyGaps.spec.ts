import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { journeyReportRows } from '../server/sim/playerJourney';
import {
  diagnoseJourneyGaps,
  expectedJourneyGapReportRowCount,
  journeyGapDiagnostics,
  journeyGapReportRows,
} from '../server/sim/playerJourneyGaps';

const CLASS_NAMES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

describe('player journey content-gap diagnostics', () => {
  const reportRows = journeyReportRows();

  it('finds route gaps without changing journey simulation output', () => {
    const summary = reportRows.find((row) => row.requestedSpecializationId === 'arcanist');

    expect(summary).toBeDefined();
    if (!summary) throw new Error('missing arcanist journey report row');

    const diagnostics = diagnoseJourneyGaps(summary);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe('high');
    expect(diagnostics.some((row) => row.kind === 'empty_windows')).toBe(true);
    expect(diagnostics.some((row) => row.kind === 'quest_gap')).toBe(true);
    expect(diagnostics.every((row) => row.pathLabel === 'arcanist')).toBe(true);
    expect(diagnostics.every((row) => row.levelBand.startsWith('L'))).toBe(true);
  });

  it('builds one worst-gap report row for every base class and specialization route', () => {
    const rows = journeyGapReportRows(reportRows);

    expect(rows).toHaveLength(expectedJourneyGapReportRowCount());
    expect(rows).toHaveLength(CLASS_NAMES.length + Object.keys(SPECIALIZATIONS).length);
    expect(new Set(rows.map((row) => row.pathLabel)).size).toBe(rows.length);
    expect(rows.every((row) => row.horizonHours > 0)).toBe(true);
    expect(rows.every((row) => row.durationHours >= 0)).toBe(true);
  });

  it('keeps full diagnostics deterministic for shared report routes', () => {
    const first = journeyGapDiagnostics(reportRows).map((row) => [
      row.pathLabel,
      row.kind,
      row.severity,
      row.levelBand,
      row.startHour.toFixed(2),
      row.endHour.toFixed(2),
    ]);
    const second = journeyGapDiagnostics(reportRows).map((row) => [
      row.pathLabel,
      row.kind,
      row.severity,
      row.levelBand,
      row.startHour.toFixed(2),
      row.endHour.toFixed(2),
    ]);

    expect(second).toEqual(first);
  });
});
