import type { CharacterClass } from '../../packages/content/classes.js';
import { SKILL_REACTIONS } from '../../packages/content/skillReactions.js';
import type { SpecializationId } from '../../packages/content/specializations.js';
import type { SkillId } from '../../packages/content/skills.js';
import type { ServerMessage } from '../../packages/protocol/messages.js';
import type { OutboundEvent } from '../transport/outboundEvents.js';
import { createGameSimulator, createSimulatedEnemy, type SimulationSummary } from './gameSimulator.js';
import {
  createClassAiPolicy,
  createSimProfilePlayer,
  SPECIALIZATION_AI_PROFILES,
  type SpecializationAiProfile,
  unlockedSkillsForSimProfile,
} from './playerPolicies.js';
import { pveSpecializationScenarios, type PveScenarioDefinition } from './scenarioCatalog.js';

type CountMap<K extends string = string> = Partial<Record<K, number>>;

export type SpecializationAiAuditRow = {
  id: string;
  className: CharacterClass;
  specializationId: SpecializationId;
  level: number;
  role: SpecializationAiProfile['role'];
  playerId: string;
  enemyId: string;
  durationMs: number;
  timedOut: boolean;
  winnerTeamId: string | null;
  damageDone: number;
  damageTaken: number;
  healingDone: number;
  castsBySkill: CountMap<SkillId>;
  castAttemptsBySkill: CountMap<SkillId>;
  expectedSkillIds: SkillId[];
  deadSkillIds: SkillId[];
  reactionCounts: CountMap;
  expectedReactionIds: string[];
  triggeredReactionIds: string[];
  untriggeredReactionIds: string[];
  commandRejectedCount: number;
  blockedCastCount: number;
  castRejectionReasons: CountMap;
  misses: number;
};

export type SpecializationAiAuditSummary = {
  rows: SpecializationAiAuditRow[];
  totals: {
    scenarios: number;
    playerWins: number;
    timedOut: number;
    commandRejected: number;
    blockedCasts: number;
    triggeredReactions: number;
    deadSkillSlots: number;
    untriggeredReactionSlots: number;
  };
  rowsWithDeadSkills: SpecializationAiAuditRow[];
  rowsWithBlockedCasts: SpecializationAiAuditRow[];
  rowsWithUntriggeredReactions: SpecializationAiAuditRow[];
};

export type SpecializationAiAuditOptions = {
  scenarios?: readonly PveScenarioDefinition[];
  timeoutMs?: number;
  enemyHealthMultiplier?: number;
  enemyDamageMultiplier?: number;
};

export function buildSpecializationAiAudit(options: SpecializationAiAuditOptions = {}): SpecializationAiAuditSummary {
  const rows = (options.scenarios ?? pveSpecializationScenarios())
    .filter((scenario): scenario is PveScenarioDefinition & { specializationId: SpecializationId } => (
      scenario.specializationId !== undefined
    ))
    .map((scenario) => runSpecializationAiAuditScenario(scenario, options));

  return {
    rows,
    totals: {
      scenarios: rows.length,
      playerWins: rows.filter((row) => row.winnerTeamId === 'players').length,
      timedOut: rows.filter((row) => row.timedOut).length,
      commandRejected: sum(rows.map((row) => row.commandRejectedCount)),
      blockedCasts: sum(rows.map((row) => row.blockedCastCount)),
      triggeredReactions: sum(rows.map((row) => sum(Object.values(row.reactionCounts)))),
      deadSkillSlots: sum(rows.map((row) => row.deadSkillIds.length)),
      untriggeredReactionSlots: sum(rows.map((row) => row.untriggeredReactionIds.length)),
    },
    rowsWithDeadSkills: rows.filter((row) => row.deadSkillIds.length > 0),
    rowsWithBlockedCasts: rows.filter((row) => row.blockedCastCount > 0),
    rowsWithUntriggeredReactions: rows.filter((row) => row.untriggeredReactionIds.length > 0),
  };
}

export function runSpecializationAiAuditScenario(
  scenario: PveScenarioDefinition & { specializationId: SpecializationId },
  options: Omit<SpecializationAiAuditOptions, 'scenarios'> = {},
): SpecializationAiAuditRow {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const profile = SPECIALIZATION_AI_PROFILES[scenario.specializationId];
  const playerId = `${scenario.id}-player`;
  const enemyId = `${scenario.id}-enemy`;
  const sim = createGameSimulator();
  const player = createSimProfilePlayer({
    id: playerId,
    className: scenario.className,
    specializationId: scenario.specializationId,
    level: scenario.level,
    position: { x: 0, z: 0 },
  });
  const enemy = createSimulatedEnemy(scenario.enemyType, scenario.enemyLevel, {
    id: enemyId,
    position: { x: 10, z: 0 },
    healthMultiplier: options.enemyHealthMultiplier ?? 4,
    damageMultiplier: options.enemyDamageMultiplier ?? 0.75,
  });

  sim.addPlayer(player, { policy: createClassAiPolicy(scenario.className, scenario.specializationId) });
  sim.addEnemy(enemy);

  const result = sim.runUntil((s) => s.isCombatResolved(), { timeoutMs });
  const combat = collectPlayerCombat(result.summary, playerId);
  const events = collectPlayerEvents(sim.events, playerId);
  const rejections = collectCommandRejections(sim.directMessages);
  const expectedSkillIds = expectedProfileSkillIds(scenario);
  const expectedReactionIds = expectedSkillIds.flatMap((skillId) => SKILL_REACTIONS[skillId]?.map((reaction) => reaction.id) ?? []);
  const triggeredReactionIds = Object.keys(events.reactionCounts).sort();

  return {
    id: scenario.id,
    className: scenario.className,
    specializationId: scenario.specializationId,
    level: scenario.level,
    role: profile.role,
    playerId,
    enemyId,
    durationMs: result.durationMs,
    timedOut: result.reason === 'timeout',
    winnerTeamId: result.summary.winnerTeamId,
    damageDone: combat.damageDone,
    damageTaken: combat.damageTaken,
    healingDone: combat.healingDone,
    castsBySkill: events.castsBySkill,
    castAttemptsBySkill: events.castAttemptsBySkill,
    expectedSkillIds,
    deadSkillIds: expectedSkillIds.filter((skillId) => !events.castAttemptsBySkill[skillId]),
    reactionCounts: events.reactionCounts,
    expectedReactionIds,
    triggeredReactionIds,
    untriggeredReactionIds: expectedReactionIds.filter((reactionId) => !events.reactionCounts[reactionId]),
    commandRejectedCount: rejections.total,
    blockedCastCount: rejections.castReqTotal,
    castRejectionReasons: rejections.castReasons,
    misses: combat.misses,
  };
}

function expectedProfileSkillIds(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SkillId[] {
  const unlocked = new Set(unlockedSkillsForSimProfile({
    className: scenario.className,
    specializationId: scenario.specializationId,
    level: scenario.level,
  }));
  const profile = SPECIALIZATION_AI_PROFILES[scenario.specializationId];
  return [...new Set(profile.rules.map((rule) => rule.skillId).filter((skillId) => unlocked.has(skillId)))];
}

function collectPlayerCombat(summary: SimulationSummary, playerId: string) {
  return {
    damageDone: summary.damageDoneById[playerId] ?? 0,
    damageTaken: summary.damageTakenById[playerId] ?? 0,
    healingDone: summary.healingDoneById[playerId] ?? 0,
    misses: summary.misses,
  };
}

function collectPlayerEvents(events: readonly OutboundEvent[], playerId: string) {
  const castsBySkill: CountMap<SkillId> = {};
  const castAttemptsBySkill: CountMap<SkillId> = {};
  const reactionCounts: CountMap = {};
  const seenCombatCasts = new Set<string>();
  const seenCastAttempts = new Set<string>();

  for (const event of events) {
    if (event.type !== 'serverMessage') continue;
    const message = event.message;
    if (message.type === 'CombatLog' && message.casterId === playerId && !seenCombatCasts.has(message.castId)) {
      seenCombatCasts.add(message.castId);
      increment(castsBySkill, message.skillId as SkillId, 1);
    } else if (message.type === 'CastSnapshot' && message.data.casterId === playerId && !seenCastAttempts.has(message.data.castId)) {
      seenCastAttempts.add(message.data.castId);
      increment(castAttemptsBySkill, message.data.skillId as SkillId, 1);
    } else if (message.type === 'ReactionTriggered') {
      increment(reactionCounts, message.reactionId, 1);
    }
  }

  return { castsBySkill, castAttemptsBySkill, reactionCounts };
}

function collectCommandRejections(messages: readonly ServerMessage[]) {
  let total = 0;
  let castReqTotal = 0;
  const castReasons: CountMap = {};
  for (const message of messages) {
    if (message.type !== 'CommandRejected') continue;
    total += 1;
    if (message.commandType === 'CastReq') {
      castReqTotal += 1;
      increment(castReasons, message.reason, 1);
    }
  }
  return { total, castReqTotal, castReasons };
}

function increment<K extends string>(counts: CountMap<K>, key: K, amount: number): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
