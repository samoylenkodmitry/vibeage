import { describe, expect, it } from 'vitest';
import {
  GRADE_MIN_LEVEL,
  GRADE_SPECS,
  getEffectiveMinLevel,
  getGradeSpec,
  listGradeSpecs,
  type ItemGrade,
} from '../packages/content/equipmentTypes';

/**
 * User: "let's add more info to the ui/ux about grades: D, C, B, A, S
 * etc to the spec source and then wiki and game engine should use
 * this info together from the single source of truth so all hints
 * tooltips and actual implementations match."
 *
 * `GRADE_SPECS` is that single source. `GRADE_MIN_LEVEL`,
 * `getEffectiveMinLevel`, the wiki Grades tab, and the item
 * tooltip's grade chip all derive from it. These tests pin the
 * derivation so a future drift between the engine gate and the
 * UI hint is impossible.
 */
describe('grade spec — single source of truth', () => {
  it('GRADE_MIN_LEVEL exactly mirrors GRADE_SPECS.minLevel for every grade', () => {
    const grades: ItemGrade[] = ['none', 'd', 'c', 'b', 'a', 's'];
    for (const g of grades) {
      expect(GRADE_MIN_LEVEL[g]).toBe(GRADE_SPECS[g].minLevel);
    }
  });

  it('getEffectiveMinLevel honours both the grade floor and the per-item override', () => {
    expect(getEffectiveMinLevel('d')).toBe(GRADE_SPECS.d.minLevel);
    expect(getEffectiveMinLevel('d', GRADE_SPECS.d.minLevel + 5))
      .toBe(GRADE_SPECS.d.minLevel + 5);
    expect(getEffectiveMinLevel('s', 10)).toBe(GRADE_SPECS.s.minLevel);
  });

  it('every grade has a non-empty label, color, and description for the UI', () => {
    for (const spec of listGradeSpecs()) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.color).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(spec.description.length).toBeGreaterThan(0);
    }
  });

  it('grades are strictly ordered by rank AND by minLevel (no inversions)', () => {
    const sorted = listGradeSpecs();
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].rank).toBeGreaterThan(sorted[i - 1].rank);
      expect(sorted[i].minLevel).toBeGreaterThanOrEqual(sorted[i - 1].minLevel);
    }
  });

  it('getGradeSpec falls back to `none` for an unknown grade id (defensive)', () => {
    expect(getGradeSpec('xyz' as ItemGrade)).toBe(GRADE_SPECS.none);
  });
});
