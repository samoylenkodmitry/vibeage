import type { SpecializationId } from '../../packages/content/specializations.js';
import type { SkillId } from '../../packages/content/skills.js';
import {
  buildSpecializationAiAudit,
  type SpecializationAiAuditOptions,
  type SpecializationAiAuditRow,
} from './specializationAiAudit.js';
import type { SkillUseTactic } from './playerPolicies.js';

export type SkillBalanceInstrumentationRow = {
  id: string;
  specializationId: SpecializationId;
  level: number;
  exerciseCount: number;
  winRate: number;
  meanDurationMs: number;
  meanSurvivalPct: number;
  meanBurstDamageFirst10s: number;
  meanControlUptimeMs: number;
  meanInterestingActionsPerMinute: number;
  meanUniqueSkillCount: number;
  meanFillerCastRatio: number;
  rotationEligibleExerciseCount: number;
  shortFightExerciseCount: number;
  tacticCounts: Record<SkillUseTactic, number>;
  deadSkillIds: SkillId[];
  riskFlags: string[];
};

export function buildSkillBalanceInstrumentation(
  options: SpecializationAiAuditOptions = {},
): SkillBalanceInstrumentationRow[] {
  const audit = buildSpecializationAiAudit(options);
  const groups = new Map<string, SpecializationAiAuditRow[]>();
  for (const row of audit.rows) {
    const key = `${row.specializationId}-l${row.level}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map(instrumentGroup);
}

function instrumentGroup(rows: readonly SpecializationAiAuditRow[]): SkillBalanceInstrumentationRow {
  const first = rows[0]!;
  const expectedSkillIds = unique(rows.flatMap((row) => row.expectedSkillIds));
  const deadSkillIds = expectedSkillIds.filter((skillId) => rows.every((row) => row.deadSkillIds.includes(skillId)));
  const winRate = rows.filter((row) => row.winnerTeamId === 'players' || row.objectiveSatisfied).length / rows.length;
  const tacticCounts = sumTactics(rows);
  const rotationEligibleExerciseCount = rows.filter((entry) => entry.durationMs >= 4000).length;
  const row: SkillBalanceInstrumentationRow = {
    id: `${first.specializationId}-l${first.level}`,
    specializationId: first.specializationId,
    level: first.level,
    exerciseCount: rows.length,
    winRate,
    meanDurationMs: mean(rows.map((entry) => entry.durationMs)),
    meanSurvivalPct: mean(rows.map((entry) => entry.playerEndingHealthPct)),
    meanBurstDamageFirst10s: mean(rows.map((entry) => entry.burstDamageFirst10s)),
    meanControlUptimeMs: mean(rows.map((entry) => entry.controlUptimeEstimateMs)),
    meanInterestingActionsPerMinute: mean(rows.map((entry) => entry.interestingActionsPerMinute)),
    meanUniqueSkillCount: mean(rows.map((entry) => entry.uniqueSkillCount)),
    meanFillerCastRatio: mean(rows.map((entry) => entry.fillerCastRatio)),
    rotationEligibleExerciseCount,
    shortFightExerciseCount: rows.length - rotationEligibleExerciseCount,
    tacticCounts,
    deadSkillIds,
    riskFlags: [],
  };
  row.riskFlags = riskFlags(row);
  return row;
}

function sumTactics(rows: readonly SpecializationAiAuditRow[]): Record<SkillUseTactic, number> {
  const counts: Record<SkillUseTactic, number> = { opener: 0, combo: 0, defensive: 0, control: 0, mobility: 0, sustain: 0, filler: 0 };
  for (const row of rows) {
    for (const tactic of Object.keys(counts) as SkillUseTactic[]) counts[tactic] += row.tacticCounts[tactic] ?? 0;
  }
  return counts;
}

function riskFlags(row: SkillBalanceInstrumentationRow): string[] {
  const flags: string[] = [];
  if (row.winRate < 1) flags.push('not-all-objectives');
  if (row.deadSkillIds.length > 0) flags.push('dead-ai-skills');
  if (row.meanInterestingActionsPerMinute < 3) flags.push('low-action-cadence');
  if (row.meanUniqueSkillCount < 3 && row.rotationEligibleExerciseCount >= 3) flags.push('low-rotation-variety');
  else if (row.meanUniqueSkillCount < 3 && row.shortFightExerciseCount > row.rotationEligibleExerciseCount) flags.push('short-fight-sample');
  if (row.meanFillerCastRatio > 0.55) flags.push('filler-heavy');
  if (row.meanControlUptimeMs <= 0 && row.tacticCounts.control > 0) flags.push('control-not-observed');
  return flags;
}

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
