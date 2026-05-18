import { describe, expect, it } from 'vitest';
import { GRADE_MIN_LEVEL, getEffectiveMinLevel, type ItemGrade } from '../packages/content/equipmentTypes';

describe('GRADE_MIN_LEVEL', () => {
  it('grade tiers are strictly non-decreasing', () => {
    const order: ItemGrade[] = ['none', 'd', 'c', 'b', 'a', 's'];
    let prev = -1;
    for (const grade of order) {
      const v = GRADE_MIN_LEVEL[grade];
      expect(v, `grade ${grade}`).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('getEffectiveMinLevel returns the per-item floor when above the grade default', () => {
    expect(getEffectiveMinLevel('d', 12)).toBe(12);
  });

  it('getEffectiveMinLevel returns the grade default when per-item is unset', () => {
    expect(getEffectiveMinLevel('c')).toBe(GRADE_MIN_LEVEL.c);
  });

  it('getEffectiveMinLevel never returns less than the grade default', () => {
    expect(getEffectiveMinLevel('s', 5)).toBe(GRADE_MIN_LEVEL.s);
  });
});
