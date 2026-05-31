import { describe, expect, it } from 'vitest';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { buildSpecializationAiAudit, runSpecializationAiAuditScenario } from '../server/sim/specializationAiAudit';

describe('specialization AI audit', () => {
  it('audits every specialization at spec and proficiency levels', () => {
    const audit = buildSpecializationAiAudit();

    expect(audit.rows).toHaveLength(Object.keys(SPECIALIZATIONS).length * 2);
    expect(audit.totals.scenarios).toBe(audit.rows.length);
    expect(audit.totals.playerWins).toBe(audit.rows.length);
    expect(audit.totals.timedOut).toBe(0);
    expect(audit.totals.blockedCasts).toBe(0);
    expect(audit.totals.triggeredReactions).toBeGreaterThan(0);
  });

  it('records cast attempts separately from combat-log impacts', () => {
    const audit = buildSpecializationAiAudit();

    for (const row of audit.rows) {
      expect(row.expectedSkillIds.length, row.id).toBeGreaterThan(0);
      expect(countTotal(row.castAttemptsBySkill), row.id).toBeGreaterThan(0);
      expect(row.deadSkillIds.every((skillId) => row.expectedSkillIds.includes(skillId)), row.id).toBe(true);
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

function countTotal(counts: Partial<Record<string, number>>): number {
  return Object.values(counts).reduce((total, value) => total + (value ?? 0), 0);
}
