import { describe, expect, it } from 'vitest';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { buildSpecializationAiAudit, runSpecializationAiAuditScenario } from '../server/sim/specializationAiAudit';

describe('specialization AI audit', () => {
  it('audits every specialization with coverage-driven exercises', () => {
    const audit = buildSpecializationAiAudit();

    expect(audit.rows.length).toBeGreaterThan(Object.keys(SPECIALIZATIONS).length * 2);
    expect(audit.coverageRows).toHaveLength(Object.keys(SPECIALIZATIONS).length * 2);
    expect(audit.totals.scenarios).toBe(audit.rows.length);
    expect(audit.totals.completed).toBe(audit.rows.length);
    expect(audit.totals.timedOut).toBe(0);
    expect(audit.totals.blockedCasts).toBe(0);
    expect(audit.totals.uncoveredSkillSlots).toBe(0);
    expect(audit.totals.untriggeredReactionSlots).toBe(0);
    expect(audit.totals.triggeredReactions).toBeGreaterThan(0);
  });

  it('aggregates skill attempts separately from per-exercise misses', () => {
    const audit = buildSpecializationAiAudit();

    for (const row of audit.coverageRows) {
      expect(row.completed, row.id).toBe(row.exerciseCount);
      expect(row.expectedSkillIds.length, row.id).toBeGreaterThan(0);
      expect(row.coveredSkillIds.sort(), row.id).toEqual(row.expectedSkillIds.sort());
      expect(row.uncoveredSkillIds, row.id).toEqual([]);
      expect(row.untriggeredReactionIds, row.id).toEqual([]);
    }
  });

  it('uses skill-focus exercises to make every profile rule selectable', () => {
    const audit = buildSpecializationAiAudit();
    const focusRows = audit.rows.filter((row) => row.exerciseKind === 'skill_focus');

    expect(focusRows.length).toBeGreaterThan(Object.keys(SPECIALIZATIONS).length * 2);
    for (const row of focusRows) {
      expect(row.focusSkillId, row.id).toBeDefined();
      expect(row.castAttemptsBySkill[row.focusSkillId!], row.id).toBeGreaterThan(0);
      expect(row.blockedCastCount, row.id).toBe(0);
    }
  });

  it('captures concrete combo reactions from simulator events', () => {
    const pyromancer = runSpecializationAiAuditScenario({
      id: 'audit-pyromancer-l40',
      className: 'mage',
      specializationId: 'pyromancer',
      level: 40,
      enemyType: 'goblin',
      enemyLevel: 40,
    });

    expect(pyromancer.triggeredReactionIds).toContain('conflagration');
    expect(pyromancer.reactionCounts.conflagration).toBeGreaterThan(0);
    expect(pyromancer.expectedReactionIds).toContain('conflagration');
    expect(pyromancer.blockedCastCount).toBe(0);
  });
});
