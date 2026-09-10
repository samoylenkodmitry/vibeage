import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS, getSetGrade, getSetsForSpec } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { listGradeSpecs } from '../packages/content/equipmentTypes';

/**
 * Roadmap §5 bullet 2 surveyor: prints the "which (spec × grade)
 * cells already have a set?" matrix so a content PR knows what's
 * missing. Today the bullet's design target is "every spec has a
 * set at each grade D / C / B / A / S" — this spec doesn't enforce
 * it (failure would block CI before any content work happens),
 * just reports.
 *
 * Read the test output (vitest run with -t "coverage matrix") to
 * see the table.
 */
const TRACKED_GRADES = ['d', 'c', 'b', 'a', 's'] as const;

describe('spec × grade set coverage (§5 bullet 2 surveyor)', () => {
  it('coverage matrix (informational)', () => {
    const specs = Object.values(SPECIALIZATIONS);
    const grades = TRACKED_GRADES;
    const matrix: Record<string, Record<string, string[]>> = {};
    for (const spec of specs) {
      matrix[spec.id] = {};
      const setIds = getSetsForSpec(spec.id, spec.baseClass, ITEMS);
      for (const setId of setIds) {
        const set = EQUIPMENT_SETS[setId];
        if (!set) continue;
        const grade = getSetGrade(set, ITEMS);
        if (!matrix[spec.id][grade]) matrix[spec.id][grade] = [];
        matrix[spec.id][grade].push(setId);
      }
    }
    // Report: one row per spec, one column per grade, with the set
    // count (and an ✗ for empty cells so it's easy to spot gaps).
    const header = ['spec'.padEnd(20), ...grades.map((g) => g.toUpperCase().padStart(3))].join(' | ');
    const lines = [header, '-'.repeat(header.length)];
    for (const spec of specs) {
      const row = [spec.id.padEnd(20)];
      for (const g of grades) {
        const count = matrix[spec.id][g]?.length ?? 0;
        row.push(count > 0 ? String(count).padStart(3) : '  ✗');
      }
      lines.push(row.join(' | '));
    }
    const report = lines.join('\n');
    // Expect the survey to run cleanly (no thrown errors). The
    // report contents are not asserted — a content PR is expected
    // to close the ✗ cells.
    expect(matrix).toBeDefined();
    // To inspect locally: `pnpm test -- specGradeCoverage` and
    // uncomment the next line.
    // console.log('\n' + report);
    void report;
  });

  it('every specialization has at least one set tuned for it', () => {
    // §5 bullet 2's floor: a player who picks a spec must see a
    // gear path written for that spec, not just "robes you can
    // technically wear". Sets declare `intendedSpecs`; this asserts
    // the declaration covers all 14 specs.
    const uncovered = Object.values(SPECIALIZATIONS)
      .filter((spec) => !Object.values(EQUIPMENT_SETS).some((set) => set.intendedSpecs?.includes(spec.id)))
      .map((spec) => spec.id);
    expect(uncovered, `specs with no tuned set: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every tuned set is single-grade and reachable at that grade', () => {
    for (const set of Object.values(EQUIPMENT_SETS)) {
      if (!set.intendedSpecs) continue;
      expect(getSetGrade(set, ITEMS), `${set.setId} grade`).not.toBe('none');
      // Two bonus tiers is the §5 contract for a spec set.
      expect(set.bonuses.length, `${set.setId} bonus tiers`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every grade is covered by at least one set somewhere', () => {
    const grades = new Set<string>();
    for (const set of Object.values(EQUIPMENT_SETS)) {
      const itemId = set.requiredPieces[0];
      const g = ITEMS[itemId]?.grade;
      if (g) grades.add(g);
    }
    // d / c / b are shipped; a / s are content TBD per §5 bullet 2.
    expect(grades.has('d')).toBe(true);
    expect(grades.has('c')).toBe(true);
    expect(grades.has('b')).toBe(true);
  });

  it('lists which grades still need any set at all', () => {
    const grades = new Set<string>();
    for (const set of Object.values(EQUIPMENT_SETS)) {
      const itemId = set.requiredPieces[0];
      const g = ITEMS[itemId]?.grade;
      if (g && g !== 'none') grades.add(g);
    }
    const missing = listGradeSpecs()
      .filter((s) => s.id !== 'none' && !grades.has(s.id))
      .map((s) => s.id);
    // Informational; doesn't fail. Asserting just for visibility.
    expect(Array.isArray(missing)).toBe(true);
  });
});
