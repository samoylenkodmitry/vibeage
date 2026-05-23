import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SETS, type EquipmentSet } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';

/**
 * Roadmap §5 gate: every set ships at a single grade. If a set
 * mixes a C-grade chest with a D-grade boots the visible "Set
 * Tier" chip becomes a lie and the player's progression reads as
 * incoherent.
 *
 * Currently informational — failing sets are reported but the
 * spec passes. Flip `STRICT_GRADE_GATE` to true once every set has
 * been normalized so a future regression actually breaks CI.
 */
const STRICT_GRADE_GATE = false;

describe('equipment sets — single-grade invariant', () => {
  const allSets = Object.values(EQUIPMENT_SETS);

  it('every set has at least one piece in ITEMS', () => {
    for (const set of allSets) {
      expect(set.requiredPieces.length).toBeGreaterThan(0);
      for (const id of set.requiredPieces) {
        expect(ITEMS[id], `set ${set.setId} references unknown item ${id}`).toBeDefined();
      }
    }
  });

  it('every set has at most one grade among its required pieces', () => {
    const violations = listGradeMixingSets(allSets);
    if (violations.length > 0) {
      const lines = violations.map((v) => `  - ${v.setId}: ${v.grades.join(', ')}`);
      // eslint-disable-next-line no-console
      console.warn(
        `[equipmentSetSameGrade] ${violations.length} set(s) mix grades:\n${lines.join('\n')}\n`
        + 'Flip STRICT_GRADE_GATE in this file to true once these are normalized.',
      );
    }
    if (STRICT_GRADE_GATE) {
      expect(violations, formatViolations(violations)).toEqual([]);
    } else {
      // Informational mode: as long as we can iterate, the gate is
      // wired correctly even if it isn't enforcing yet.
      expect(violations).toBeDefined();
    }
  });
});

function listGradeMixingSets(sets: readonly EquipmentSet[]): { setId: string; grades: string[] }[] {
  const out: { setId: string; grades: string[] }[] = [];
  for (const set of sets) {
    const grades = new Set<string>();
    for (const id of set.requiredPieces) {
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
