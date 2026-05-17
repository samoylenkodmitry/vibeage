import { describe, expect, it } from 'vitest';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';

/**
 * Authoring guardrails for enemy stat multipliers. These bounds are
 * derived from the current content — Wyrm sits at the upper end with
 * health 2.5 / damage 2.0, slimes/sprites at the lower end. The intent
 * is to catch a designer accidentally shipping a one-shot or a damage
 * sponge by typo (1.5 vs 15), not to constrain reasonable design
 * iteration. If a deliberate change pushes a template outside the
 * budget, raise the bound in this test along with the data change.
 */

const HEALTH_BUDGET = { min: 0.5, max: 3.0 };
const DAMAGE_BUDGET = { min: 0.3, max: 3.0 };
const MOVEMENT_SPEED_BUDGET = { min: 0.5, max: 2.0 };
const ATTACK_RANGE_BUDGET = { min: 0.5, max: 2.5 };
const AGGRO_RADIUS_BUDGET = { min: 0.5, max: 2.5 };
const ATTACK_COOLDOWN_BUDGET = { min: 0.5, max: 2.0 };
const EXP_BUDGET = { min: 0.3, max: 5.0 };

describe('enemy stat balance budgets (Section 19 L864)', () => {
  for (const [type, template] of Object.entries(ENEMY_TEMPLATES)) {
    describe(type, () => {
      it('health multiplier is within budget', () => {
        const v = template.stats.health;
        expect(v, `${type}.stats.health=${v} outside [${HEALTH_BUDGET.min}, ${HEALTH_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(HEALTH_BUDGET.min);
        expect(v).toBeLessThanOrEqual(HEALTH_BUDGET.max);
      });

      it('damage multiplier is within budget', () => {
        const v = template.stats.damage;
        expect(v, `${type}.stats.damage=${v} outside [${DAMAGE_BUDGET.min}, ${DAMAGE_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(DAMAGE_BUDGET.min);
        expect(v).toBeLessThanOrEqual(DAMAGE_BUDGET.max);
      });

      it('movementSpeed multiplier is within budget', () => {
        const v = template.stats.movementSpeed;
        expect(v, `${type}.stats.movementSpeed=${v} outside [${MOVEMENT_SPEED_BUDGET.min}, ${MOVEMENT_SPEED_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(MOVEMENT_SPEED_BUDGET.min);
        expect(v).toBeLessThanOrEqual(MOVEMENT_SPEED_BUDGET.max);
      });

      it('attackRange multiplier is within budget', () => {
        const v = template.stats.attackRange;
        expect(v, `${type}.stats.attackRange=${v} outside [${ATTACK_RANGE_BUDGET.min}, ${ATTACK_RANGE_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(ATTACK_RANGE_BUDGET.min);
        expect(v).toBeLessThanOrEqual(ATTACK_RANGE_BUDGET.max);
      });

      it('aggroRadius multiplier is within budget', () => {
        const v = template.stats.aggroRadius;
        expect(v, `${type}.stats.aggroRadius=${v} outside [${AGGRO_RADIUS_BUDGET.min}, ${AGGRO_RADIUS_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(AGGRO_RADIUS_BUDGET.min);
        expect(v).toBeLessThanOrEqual(AGGRO_RADIUS_BUDGET.max);
      });

      it('attackCooldownMs multiplier is within budget', () => {
        const v = template.stats.attackCooldownMs;
        expect(v, `${type}.stats.attackCooldownMs=${v} outside [${ATTACK_COOLDOWN_BUDGET.min}, ${ATTACK_COOLDOWN_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(ATTACK_COOLDOWN_BUDGET.min);
        expect(v).toBeLessThanOrEqual(ATTACK_COOLDOWN_BUDGET.max);
      });

      it('experience multiplier is within budget', () => {
        const v = template.stats.experience;
        expect(v, `${type}.stats.experience=${v} outside [${EXP_BUDGET.min}, ${EXP_BUDGET.max}]`)
          .toBeGreaterThanOrEqual(EXP_BUDGET.min);
        expect(v).toBeLessThanOrEqual(EXP_BUDGET.max);
      });
    });
  }
});
