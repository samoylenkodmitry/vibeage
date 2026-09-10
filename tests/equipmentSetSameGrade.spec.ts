import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS, getSetGrade, type EquipmentSet } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';

/**
 * Roadmap §5 gate: every set ships at a single grade. If a set
 * mixes a C-grade chest with a D-grade boots the visible "Set
 * Tier" chip becomes a lie and the player's progression reads as
 * incoherent.
 *
 * Enforcing: every shipped set is single-grade, so the wiki Sets
 * tab's "mixed tiers" annotation is unreachable and `getSetGrade`
 * is a lookup rather than a guess. `optionalPieces` count too — an
 * optional piece at a different grade would still show a second
 * tier chip on the set page.
 */

describe('equipment sets — single-grade invariant', () => {
  const allSets = Object.values(EQUIPMENT_SETS);

  it('every set has at least one piece in ITEMS', () => {
    for (const set of allSets) {
      expect(set.requiredPieces.length).toBeGreaterThan(0);
      for (const id of [...set.requiredPieces, ...(set.optionalPieces ?? [])]) {
        expect(ITEMS[id], `set ${set.setId} references unknown item ${id}`).toBeDefined();
      }
    }
  });

  it('every set has at most one grade among its required pieces', () => {
    const violations = listGradeMixingSets(allSets);
    if (violations.length > 0) {
      const lines = violations.map((v) => `  - ${v.setId}: ${v.grades.join(', ')}`);
      console.warn(
        `[equipmentSetSameGrade] ${violations.length} set(s) mix grades:\n${lines.join('\n')}\n`
        + 'Flip STRICT_GRADE_GATE in this file to true once these are normalized.',
      );
    }
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('getSetGrade agrees with the single grade on the pieces', () => {
    for (const set of allSets) {
      const grade = getSetGrade(set, ITEMS);
      for (const id of [...set.requiredPieces, ...(set.optionalPieces ?? [])]) {
        expect(ITEMS[id]?.grade ?? 'none', `${set.setId} piece ${id}`).toBe(grade);
      }
    }
  });
});

function listGradeMixingSets(sets: readonly EquipmentSet[]): { setId: string; grades: string[] }[] {
  const out: { setId: string; grades: string[] }[] = [];
  for (const set of sets) {
    const grades = new Set<string>();
    for (const id of [...set.requiredPieces, ...(set.optionalPieces ?? [])]) {
      const grade = ITEMS[id]?.grade ?? 'none';
      grades.add(grade);
    }
    if (grades.size > 1) out.push({ setId: set.setId, grades: [...grades].sort() });
  }
  return out;
}

function formatViolations(violations: { setId: string; grades: string[] }[]): string {
  if (violations.length === 0) return '';
  return `Sets mixing grades:\n${violations.map((v) => `  ${v.setId}: ${v.grades.join(', ')}`).join('\n')}`;
}
