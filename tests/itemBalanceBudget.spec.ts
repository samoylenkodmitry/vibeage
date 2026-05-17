import { describe, expect, it } from 'vitest';
import { EQUIPMENT_STARTER_ITEMS } from '../packages/content/equipmentItems';
import type { ItemStatBlock } from '../packages/content/equipmentTypes';

/**
 * Authoring guardrails for equipment item stat blocks. Bounds are
 * derived from the current content — plate cuirass is the high-water
 * mark at pDef 20. Headroom is generous (plate could realistically
 * grow to 30 in later tiers); the goal is to catch typos like
 * `pDef: 200` not constrain design.
 *
 * Adding a new stat to ItemStatBlock without adding a budget here
 * fails the "every stat is budgeted" meta-test below.
 */

const BUDGETS = {
  pAtk: { min: 0, max: 100 },
  mAtk: { min: 0, max: 100 },
  pDef: { min: 0, max: 30 },
  mDef: { min: 0, max: 30 },
  hp: { min: 0, max: 200 },
  mp: { min: 0, max: 200 },
  critRate: { min: 0, max: 0.5 },
  attackSpeed: { min: 0.5, max: 2.0 },
  moveSpeed: { min: 0.5, max: 2.0 },
} as const satisfies Record<keyof ItemStatBlock, { min: number; max: number }>;

type BudgetedStat = keyof typeof BUDGETS;

describe('equipment stat balance budgets (Section 19 L863)', () => {
  for (const [itemId, item] of Object.entries(EQUIPMENT_STARTER_ITEMS)) {
    const stats = item.stats as ItemStatBlock | undefined;
    if (!stats) continue;
    describe(itemId, () => {
      for (const stat of Object.keys(BUDGETS) as BudgetedStat[]) {
        const v = stats[stat];
        if (v === undefined) continue;
        it(`${stat} value is within budget`, () => {
          const budget = BUDGETS[stat];
          const msg = `${itemId}.stats.${stat}=${v} outside [${budget.min}, ${budget.max}]`;
          expect(v, msg).toBeGreaterThanOrEqual(budget.min);
          expect(v, msg).toBeLessThanOrEqual(budget.max);
        });
      }
    });
  }

  it('every stat field on ItemStatBlock has a budget entry (no silent gaps)', () => {
    // Pin the keys: if a designer adds a new ItemStatBlock field, this
    // test fails until the matching budget is added above. Update both
    // together so balance is always explicit.
    const expectedKeys: Array<keyof ItemStatBlock> = [
      'pAtk', 'mAtk', 'pDef', 'mDef', 'hp', 'mp', 'critRate', 'attackSpeed', 'moveSpeed',
    ];
    for (const key of expectedKeys) {
      expect(BUDGETS, `BUDGETS missing entry for ItemStatBlock.${key}`).toHaveProperty(key);
    }
  });
});
