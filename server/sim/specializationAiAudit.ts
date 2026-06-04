import type { CharacterClass } from '../../packages/content/classes.js';
import { SKILL_REACTIONS } from '../../packages/content/skillReactions.js';
import type { SpecializationId } from '../../packages/content/specializations.js';
import { SKILLS, type SkillEffectType, type SkillId } from '../../packages/content/skills.js';
import type { ServerMessage } from '../../packages/protocol/messages.js';
import type { StatusEffect } from '../../packages/sim/entities.js';
import type { OutboundEvent } from '../transport/outboundEvents.js';
import { createGameSimulator, createSimulatedEnemy, type SimulationSummary, type TimedOutboundEvent } from './gameSimulator.js';
import {
  createClassAiPolicy,
  createSimProfilePlayer,
  SPECIALIZATION_AI_PROFILES,
  type SkillUseTactic,
  type SpecializationAiProfile,
  unlockedSkillsForSimProfile,
} from './playerPolicies.js';
import {
  specializationAiExerciseCatalog,
  type SpecializationAiExerciseDefinition,
  type SpecializationAiExerciseKind,
} from './specializationAiExercises.js';
import { type PveScenarioDefinition } from './scenarioCatalog.js';

type CountMap<K extends string = string> = Partial<Record<K, number>>;

export type SpecializationAiAuditScenario = PveScenarioDefinition & {
  specializationId: SpecializationId;
  exerciseKind?: SpecializationAiExerciseKind;
  purpose?: string;
  focusSkillId?: SkillId;
  playerHealthFraction?: number;
  allyHealthFraction?: number;
  enemyHealthFraction?: number;
  enemyHealthMultiplier?: number;
  enemyDamageMultiplier?: number;
  targetEffects?: SkillEffectType[];
  casterEffects?: SkillEffectType[];
  cooldownSkillIds?: SkillId[];
  cooldownLockMs?: number;
  timeoutMs?: number;
};

export type SpecializationAiAuditRow = {
  id: string;
  exerciseKind: SpecializationAiExerciseKind;
  purpose: string;
  focusSkillId?: SkillId;
  className: CharacterClass;
  specializationId: SpecializationId;
  level: number;
  role: SpecializationAiProfile['role'];
  playerId: string;
  enemyId: string;
  durationMs: number;
  objectiveSatisfied: boolean;
  timedOut: boolean;
  winnerTeamId: string | null;
  damageDone: number;
  damageTaken: number;
  healingDone: number;
  playerEndingHealthPct: number;
  burstDamageFirst10s: number;
  healingFirst10s: number;
  firstCastDelayMs: number | null;
  controlUptimeEstimateMs: number;
  interestingActionsPerMinute: number;
  uniqueSkillCount: number;
  fillerCastRatio: number;
  tacticCounts: Record<SkillUseTactic, number>;
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

export type SpecializationAiCoverageRow = {
  id: string;
  className: CharacterClass;
  specializationId: SpecializationId;
  level: number;
  role: SpecializationAiProfile['role'];
  exerciseCount: number;
  completed: number;
  playerWins: number;
  timedOut: number;
  expectedSkillIds: SkillId[];
  coveredSkillIds: SkillId[];
  uncoveredSkillIds: SkillId[];
  expectedReactionIds: string[];
  triggeredReactionIds: string[];
  untriggeredReactionIds: string[];
  commandRejectedCount: number;
  blockedCastCount: number;
};

export type SpecializationAiAuditSummary = {
  rows: SpecializationAiAuditRow[];
  coverageRows: SpecializationAiCoverageRow[];
  totals: {
    scenarios: number;
    coverageRows: number;
    completed: number;
    playerWins: number;
    timedOut: number;
    objectiveSatisfied: number;
    commandRejected: number;
    blockedCasts: number;
    triggeredReactions: number;
    deadSkillSlots: number;
    uncoveredSkillSlots: number;
    untriggeredReactionSlots: number;
  };
  rowsWithDeadSkills: SpecializationAiAuditRow[];
  rowsWithBlockedCasts: SpecializationAiAuditRow[];
  rowsWithUntriggeredReactions: SpecializationAiAuditRow[];
  coverageRowsWithUncoveredSkills: SpecializationAiCoverageRow[];
  coverageRowsWithUntriggeredReactions: SpecializationAiCoverageRow[];
};

export type SpecializationAiAuditOptions = {
  scenarios?: readonly SpecializationAiAuditScenario[];
  exercises?: readonly SpecializationAiExerciseDefinition[];
  timeoutMs?: number;
  enemyHealthMultiplier?: number;
  enemyDamageMultiplier?: number;
};

export function buildSpecializationAiAudit(options: SpecializationAiAuditOptions = {}): SpecializationAiAuditSummary {
  const rows = (options.scenarios ?? options.exercises ?? specializationAiExerciseCatalog())
    .filter((scenario): scenario is PveScenarioDefinition & { specializationId: SpecializationId } => (
      scenario.specializationId !== undefined
    ))
    .map((scenario) => runSpecializationAiAuditScenario(scenario, options));
  const coverageRows = buildCoverageRows(rows);

  return {
    rows,
    coverageRows,
    totals: {
      scenarios: rows.length,
      coverageRows: coverageRows.length,
      completed: rows.filter((row) => row.objectiveSatisfied || row.winnerTeamId === 'players').length,
      playerWins: rows.filter((row) => row.winnerTeamId === 'players').length,
      timedOut: rows.filter((row) => row.timedOut).length,
      objectiveSatisfied: rows.filter((row) => row.objectiveSatisfied).length,
      commandRejected: sum(rows.map((row) => row.commandRejectedCount)),
      blockedCasts: sum(rows.map((row) => row.blockedCastCount)),
      triggeredReactions: sum(rows.map((row) => sum(Object.values(row.reactionCounts)))),
      deadSkillSlots: sum(rows.map((row) => row.deadSkillIds.length)),
      uncoveredSkillSlots: sum(coverageRows.map((row) => row.uncoveredSkillIds.length)),
      untriggeredReactionSlots: sum(coverageRows.map((row) => row.untriggeredReactionIds.length)),
    },
    rowsWithDeadSkills: rows.filter((row) => row.deadSkillIds.length > 0),
    rowsWithBlockedCasts: rows.filter((row) => row.blockedCastCount > 0),
    rowsWithUntriggeredReactions: rows.filter((row) => row.untriggeredReactionIds.length > 0),
    coverageRowsWithUncoveredSkills: coverageRows.filter((row) => row.uncoveredSkillIds.length > 0),
    coverageRowsWithUntriggeredReactions: coverageRows.filter((row) => row.untriggeredReactionIds.length > 0),
  };
}

export function runSpecializationAiAuditScenario(
  scenario: SpecializationAiAuditScenario,
  options: Omit<SpecializationAiAuditOptions, 'scenarios'> = {},
): SpecializationAiAuditRow {
  const timeoutMs = options.timeoutMs ?? scenario.timeoutMs ?? 120_000;
  const profile: SpecializationAiProfile = SPECIALIZATION_AI_PROFILES[scenario.specializationId];
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
  const ally = scenario.allyHealthFraction === undefined ? null : createSimProfilePlayer({
    id: `${scenario.id}-ally`,
    className: scenario.className,
    specializationId: scenario.specializationId,
    level: scenario.level,
    position: { x: 2, z: 0 },
  });
  const enemy = createSimulatedEnemy(scenario.enemyType, scenario.enemyLevel, {
    id: enemyId,
    position: { x: 10, z: 0 },
    healthMultiplier: options.enemyHealthMultiplier ?? scenario.enemyHealthMultiplier ?? 4,
    damageMultiplier: options.enemyDamageMultiplier ?? scenario.enemyDamageMultiplier ?? 0.75,
  });
  applyHealthFraction(player, scenario.playerHealthFraction);
  if (ally) applyHealthFraction(ally, scenario.allyHealthFraction);
  applyHealthFraction(enemy, scenario.enemyHealthFraction);
  applyStatusEffects(player.statusEffects, scenario.casterEffects, sim.now());
  applyStatusEffects(enemy.statusEffects, scenario.targetEffects, sim.now());
  for (const skillId of scenario.cooldownSkillIds ?? []) {
    player.skillCooldownEndTs[skillId] = sim.now() + (scenario.cooldownLockMs ?? 60_000);
  }

  const expectedSkillIds = expectedProfileSkillIds(scenario);
  const expectedReactionIds = expectedSkillIds.flatMap((skillId) => SKILL_REACTIONS[skillId]?.map((reaction) => reaction.id) ?? []);

  sim.addPlayer(player, { policy: createClassAiPolicy(scenario.className, scenario.specializationId) });
  if (ally) sim.addPlayer(ally);
  sim.addEnemy(enemy);

  const result = sim.runUntil(
    (s) => s.isCombatResolved() || exerciseObjectiveSatisfied(s.events, playerId, scenario, expectedSkillIds, expectedReactionIds),
    { timeoutMs },
  );
  const combat = collectPlayerCombat(result.summary, playerId);
  const playerSummary = result.summary.players[playerId];
  const events = collectPlayerEvents(sim.events, playerId);
  const timing = collectTimelineMetrics(sim.timeline, playerId, result.durationMs);
  const controlUptimeEstimateMs = estimateControlUptimeMs(events.castAttemptsBySkill);
  const rejections = collectCommandRejections(sim.directMessages);
  const triggeredReactionIds = Object.keys(events.reactionCounts).sort();

  return {
    id: scenario.id,
    exerciseKind: scenario.exerciseKind ?? 'baseline',
    purpose: scenario.purpose ?? 'Single PvE specialization smoke scenario.',
    focusSkillId: scenario.focusSkillId,
    className: scenario.className,
    specializationId: scenario.specializationId,
    level: scenario.level,
    role: profile.role,
    playerId,
    enemyId,
    durationMs: result.durationMs,
    objectiveSatisfied: exerciseObjectiveSatisfied(sim.events, playerId, scenario, expectedSkillIds, expectedReactionIds),
    timedOut: result.reason === 'timeout',
    winnerTeamId: result.summary.winnerTeamId,
    damageDone: combat.damageDone,
    damageTaken: combat.damageTaken,
    healingDone: combat.healingDone,
    playerEndingHealthPct: playerSummary ? healthPct(playerSummary) : 0,
    burstDamageFirst10s: timing.burstDamageFirst10s,
    healingFirst10s: timing.healingFirst10s,
    firstCastDelayMs: timing.firstCastDelayMs,
    controlUptimeEstimateMs,
    interestingActionsPerMinute: interestingActionsPerMinute(events.castAttemptsBySkill, result.durationMs),
    uniqueSkillCount: Object.keys(events.castAttemptsBySkill).length,
    fillerCastRatio: fillerCastRatio(events.castAttemptsBySkill),
    tacticCounts: tacticCounts(events.castAttemptsBySkill, profile),
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

function exerciseObjectiveSatisfied(
  events: readonly OutboundEvent[],
  playerId: string,
  scenario: SpecializationAiAuditScenario,
  expectedSkillIds: readonly SkillId[],
  expectedReactionIds: readonly string[],
): boolean {
  if (!scenario.exerciseKind || scenario.exerciseKind === 'baseline') return false;

  const observed = collectPlayerEvents(events, playerId);
  if (scenario.focusSkillId) return focusObjectiveSatisfied(observed, scenario.focusSkillId);
  if (scenario.exerciseKind === 'reaction_setup') {
    return expectedReactionIds.length === 0
      ? countKeys(observed.castAttemptsBySkill) >= 2
      : expectedReactionIds.some((reactionId) => observed.reactionCounts[reactionId]);
  }

  if (expectedSkillIds.length === 0) return false;

  const coveredSkills = expectedSkillIds.filter((skillId) => observed.castAttemptsBySkill[skillId]).length;
  return coveredSkills >= Math.min(expectedSkillIds.length, 2);
}

function focusObjectiveSatisfied(
  observed: ReturnType<typeof collectPlayerEvents>,
  focusSkillId: SkillId,
): boolean {
  const reactionIds = SKILL_REACTIONS[focusSkillId]?.map((reaction) => reaction.id) ?? [];
  if (reactionIds.length > 0) return reactionIds.every((reactionId) => observed.reactionCounts[reactionId]);
  if (SKILLS[focusSkillId]?.customBehavior) return Boolean(observed.castAttemptsBySkill[focusSkillId]);
  if (SKILLS[focusSkillId]?.kind === 'utility') return Boolean(observed.castAttemptsBySkill[focusSkillId]);
  return Boolean(observed.castsBySkill[focusSkillId]);
}

function buildCoverageRows(rows: readonly SpecializationAiAuditRow[]): SpecializationAiCoverageRow[] {
  const groups = new Map<string, SpecializationAiAuditRow[]>();
  for (const row of rows) {
    const key = `${row.specializationId}-l${row.level}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const expectedSkillIds = unique(group.flatMap((row) => row.expectedSkillIds));
    const coveredSkillIds = expectedSkillIds.filter((skillId) => group.some((row) => row.castAttemptsBySkill[skillId]));
    const expectedReactionIds = unique(group.flatMap((row) => row.expectedReactionIds));
    const triggeredReactionIds = expectedReactionIds.filter((reactionId) => group.some((row) => row.reactionCounts[reactionId]));
    return {
      id: `${first.specializationId}-l${first.level}`,
      className: first.className,
      specializationId: first.specializationId,
      level: first.level,
      role: first.role,
      exerciseCount: group.length,
      completed: group.filter((row) => row.objectiveSatisfied || row.winnerTeamId === 'players').length,
      playerWins: group.filter((row) => row.winnerTeamId === 'players').length,
      timedOut: group.filter((row) => row.timedOut).length,
      expectedSkillIds,
      coveredSkillIds,
      uncoveredSkillIds: expectedSkillIds.filter((skillId) => !coveredSkillIds.includes(skillId)),
      expectedReactionIds,
      triggeredReactionIds,
      untriggeredReactionIds: expectedReactionIds.filter((reactionId) => !triggeredReactionIds.includes(reactionId)),
      commandRejectedCount: sum(group.map((row) => row.commandRejectedCount)),
      blockedCastCount: sum(group.map((row) => row.blockedCastCount)),
    };
  });
}

function expectedProfileSkillIds(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SkillId[] {
  const unlocked = new Set(unlockedSkillsForSimProfile({
    className: scenario.className,
    specializationId: scenario.specializationId,
    level: scenario.level,
  }));
  const profile: SpecializationAiProfile = SPECIALIZATION_AI_PROFILES[scenario.specializationId];
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

function collectTimelineMetrics(timeline: readonly TimedOutboundEvent[], playerId: string, durationMs: number) {
  const seenCasts = new Set<string>();
  let burstDamageFirst10s = 0;
  let healingFirst10s = 0;
  let firstCastDelayMs: number | null = null;

  for (const item of timeline) {
    if (item.event.type !== 'serverMessage') continue;
    const message = item.event.message;
    if (message.type === 'CastSnapshot' && message.data.casterId === playerId && !seenCasts.has(message.data.castId)) {
      seenCasts.add(message.data.castId);
      firstCastDelayMs ??= Math.max(0, item.now);
    }
    if (message.type !== 'CombatLog' || message.casterId !== playerId || item.now > 10_000) continue;
    burstDamageFirst10s += sum(message.damages);
    healingFirst10s += sum(message.heals ?? []);
  }

  return {
    burstDamageFirst10s,
    healingFirst10s,
    firstCastDelayMs: durationMs > 0 ? firstCastDelayMs : null,
  };
}

function estimateControlUptimeMs(castsBySkill: CountMap<SkillId>): number {
  return Object.entries(castsBySkill).reduce((total, [skillId, count]) => (
    total + (count ?? 0) * skillControlDurationMs(skillId as SkillId)
  ), 0);
}

function skillControlDurationMs(skillId: SkillId): number {
  const skill = SKILLS[skillId];
  if (!skill) return 0;
  const effectDuration = Math.max(0, ...skill.effects
    .filter((effect) => ['stun', 'slow', 'freeze', 'timeStop', 'taunt', 'silence', 'knockback', 'marked', 'waterWeakness'].includes(effect.type))
    .map((effect) => effect.durationMs ?? 0));
  if (effectDuration > 0) return effectDuration;
  if (!skill.customBehavior) return 0;
  if (['phasePrison', 'stasisLattice', 'gravityWell', 'tripwireVolley', 'bulwarkZone', 'seismicRend'].includes(skill.customBehavior)) return 3000;
  if (['magmaChain', 'guardianHook', 'vengeanceTether', 'jackpotSnare', 'ricochetPrism', 'harmonicSeal', 'nightfallNet', 'painDividend', 'loadedMirage'].includes(skill.customBehavior)) return 2200;
  if (['terrainSigil', 'umbraMine', 'puppetMastery', 'tidalBarrier', 'sanctuaryGate', 'purifyingMirror', 'cinderHalo'].includes(skill.customBehavior)) return 1800;
  return 0;
}

function interestingActionsPerMinute(castsBySkill: CountMap<SkillId>, durationMs: number): number {
  const interesting = Object.entries(castsBySkill)
    .filter(([skillId]) => skillId !== 'basicAttack')
    .reduce((total, [, count]) => total + (count ?? 0), 0);
  return durationMs > 0 ? interesting / (durationMs / 60_000) : 0;
}

function fillerCastRatio(castsBySkill: CountMap<SkillId>): number {
  const total = sum(Object.values(castsBySkill));
  return total > 0 ? (castsBySkill.basicAttack ?? 0) / total : 0;
}

function tacticCounts(castsBySkill: CountMap<SkillId>, profile: SpecializationAiProfile): Record<SkillUseTactic, number> {
  const counts: Record<SkillUseTactic, number> = { opener: 0, combo: 0, defensive: 0, control: 0, mobility: 0, sustain: 0, filler: 0 };
  for (const [skillId, count] of Object.entries(castsBySkill) as Array<[SkillId, number]>) {
    counts[tacticForSkill(profile, skillId)] += count ?? 0;
  }
  return counts;
}

function tacticForSkill(profile: SpecializationAiProfile, skillId: SkillId): SkillUseTactic {
  for (const tactic of Object.keys(profile.tactics) as SkillUseTactic[]) {
    if (profile.tactics[tactic].includes(skillId)) return tactic;
  }
  return 'filler';
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

function applyHealthFraction(entity: { health: number; maxHealth: number }, fraction: number | undefined): void {
  if (fraction === undefined) return;
  entity.health = Math.max(1, Math.floor(entity.maxHealth * fraction));
}

function healthPct(entity: { health: number; maxHealth: number }): number {
  return entity.maxHealth > 0 ? Math.max(0, Math.min(1, entity.health / entity.maxHealth)) : 0;
}

function applyStatusEffects(
  statusEffects: StatusEffect[],
  effectTypes: readonly SkillEffectType[] | undefined,
  now: number,
): void {
  for (const type of effectTypes ?? []) {
    statusEffects.push(statusEffect(type, now));
  }
}

function statusEffect(type: SkillEffectType, now: number): StatusEffect {
  return {
    id: `sim-audit-${type}-${now}`,
    type,
    value: 1,
    durationMs: 120_000,
    startTimeTs: now,
    sourceSkill: 'sim-audit',
    stacks: 1,
  };
}

function increment<K extends string>(counts: CountMap<K>, key: K, amount: number): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function countKeys(counts: CountMap): number {
  return Object.keys(counts).length;
}

function sum(values: readonly (number | undefined)[]): number {
  return values.reduce((total, value) => total + (value ?? 0), 0);
}
