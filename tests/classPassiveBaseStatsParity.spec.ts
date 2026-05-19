import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import { CLASS_PASSIVES } from '../packages/content/classPassives';

/**
 * Class multipliers have two live sources: CLASS_SKILL_TREES[c].baseStats
 * (carried in the ClassSelected protocol message for legacy clients)
 * and CLASS_PASSIVES (read by the Contribution registry in
 * packages/sim/statContributions.ts).
 *
 * They must match. This test fails the moment a designer edits one
 * without the other, preventing the drift-prone state the code
 * reviewer flagged.
 */

describe('class baseStats <-> CLASS_PASSIVES parity', () => {
  for (const className of Object.keys(CLASS_SKILL_TREES) as CharacterClass[]) {
    it(`${className}: baseStats === CLASS_PASSIVES.modifiers (each field)`, () => {
      const oldBaseStats = CLASS_SKILL_TREES[className].baseStats;
      const newModifiers = CLASS_PASSIVES[className]?.modifiers ?? {};

      // healthMultiplier / manaMultiplier / damageMultiplier / speedMultiplier
      // default to 1 on either side when omitted; the test treats omission
      // and explicit 1 as equivalent so the new shape can drop neutral entries.
      const fields: Array<keyof typeof oldBaseStats> = [
        'healthMultiplier',
        'manaMultiplier',
        'damageMultiplier',
        'speedMultiplier',
      ];
      for (const field of fields) {
        const oldVal = oldBaseStats[field] ?? 1;
        const newVal = newModifiers[field] ?? 1;
        expect(
          newVal,
          `${className}.${field}: CLASS_PASSIVES has ${newVal} but CLASS_SKILL_TREES has ${oldVal}. ` +
          'Update both or remove the legacy entry.',
        ).toBe(oldVal);
      }
    });
  }
});
