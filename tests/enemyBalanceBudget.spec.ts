import { describe, expect, it } from 'vitest';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';

/**
 * Authoring guardrails for enemy stat multipliers. These bounds are
 * derived from the current content — Wyrm sits at the upper end with
 * health 2.5 / damage 2.0, slimes/sprites at the lower end. The intent
 * is to catch a designer accidentally shipping a one-shot or a damage
 * sponge by typo (1.5 vs 15), not to constrain reasonable design
 * iteration. If a deliberate change pushes a template outside the
 * budget, raise the bound here alongside the data change.
 */

const BUDGETS = {
  health: { min: 0.5, max: 3.0 },
  damage: { min: 0.3, max: 3.0 },
  movementSpeed: { min: 0.5, max: 2.0 },
  attackRange: { min: 0.5, max: 2.5 },
  aggroRadius: { min: 0.5, max: 2.5 },
  attackCooldownMs: { min: 0.5, max: 2.0 },
  experience: { min: 0.3, max: 5.0 },
} as const satisfies Record<string, { min: number; max: number }>;

type BudgetedStat = keyof typeof BUDGETS;

describe('enemy stat balance budgets (Section 19 L864)', () => {
  for (const [type, template] of Object.entries(ENEMY_TEMPLATES)) {
    describe(type, () => {
      for (const stat of Object.keys(BUDGETS) as BudgetedStat[]) {
        const budget = BUDGETS[stat];
        it(`${stat} multiplier is within budget`, () => {
          const v = template.stats[stat];
          const msg = `${type}.stats.${stat}=${v} outside [${budget.min}, ${budget.max}]`;
          expect(v, msg).toBeGreaterThanOrEqual(budget.min);
          expect(v, msg).toBeLessThanOrEqual(budget.max);
        });
      }
    });
  }
});
