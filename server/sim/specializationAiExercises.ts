import { SKILL_REACTIONS } from '../../packages/content/skillReactions.js';
import { type SpecializationId } from '../../packages/content/specializations.js';
import { SKILLS, type SkillEffectType, type SkillId } from '../../packages/content/skills.js';
import {
  SPECIALIZATION_AI_PROFILES,
  type SkillUseCondition,
  type SkillUseRule,
  type SpecializationAiProfile,
  unlockedSkillsForSimProfile,
} from './playerPolicies.js';
import { pveSpecializationScenarios, type PveScenarioDefinition } from './scenarioCatalog.js';

export type SpecializationAiExerciseKind =
  | 'baseline'
  | 'marathon'
  | 'wounded'
  | 'reaction_setup'
  | 'skill_focus';

export type SpecializationAiExerciseDefinition = PveScenarioDefinition & {
  specializationId: SpecializationId;
  exerciseKind: SpecializationAiExerciseKind;
  purpose: string;
  focusSkillId?: SkillId;
  playerHealthFraction?: number;
  enemyHealthFraction?: number;
  enemyHealthMultiplier?: number;
  enemyDamageMultiplier?: number;
  targetEffects?: SkillEffectType[];
  casterEffects?: SkillEffectType[];
  cooldownSkillIds?: SkillId[];
  cooldownLockMs?: number;
  timeoutMs?: number;
};

const DEFAULT_FOCUS_TIMEOUT_MS = 90_000;
const DEFAULT_COOLDOWN_LOCK_MS = 75_000;

export function specializationAiExerciseCatalog(): SpecializationAiExerciseDefinition[] {
  return pveSpecializationScenarios().flatMap((scenario) => {
    if (!scenario.specializationId) return [];
    const specScenario = scenario as PveScenarioDefinition & { specializationId: SpecializationId };
    return [
      baselineExercise(specScenario),
      marathonExercise(specScenario),
      woundedExercise(specScenario),
      reactionSetupExercise(specScenario),
      ...skillFocusExercises(specScenario),
    ];
  });
}

function baselineExercise(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SpecializationAiExerciseDefinition {
  return {
    ...scenario,
    id: `${scenario.id}-baseline`,
    exerciseKind: 'baseline',
    purpose: 'Normal durable PvE smoke fight.',
    enemyHealthMultiplier: 4,
    enemyDamageMultiplier: 0.75,
  };
}

function marathonExercise(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SpecializationAiExerciseDefinition {
  return {
    ...scenario,
    id: `${scenario.id}-marathon`,
    exerciseKind: 'marathon',
    purpose: 'Long fight that lets cooldown rotations and fallback rules appear.',
    playerHealthFraction: 0.68,
    enemyHealthMultiplier: 24,
    enemyDamageMultiplier: 0.3,
    timeoutMs: DEFAULT_FOCUS_TIMEOUT_MS,
  };
}

function woundedExercise(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SpecializationAiExerciseDefinition {
  return {
    ...scenario,
    id: `${scenario.id}-wounded`,
    exerciseKind: 'wounded',
    purpose: 'Starts the player wounded so defensive, shield, and heal rules are exercised.',
    playerHealthFraction: 0.42,
    enemyHealthMultiplier: 18,
    enemyDamageMultiplier: 0.2,
    timeoutMs: DEFAULT_FOCUS_TIMEOUT_MS,
  };
}

function reactionSetupExercise(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SpecializationAiExerciseDefinition {
  return {
    ...scenario,
    id: `${scenario.id}-reaction-setup`,
    exerciseKind: 'reaction_setup',
    purpose: 'Seeds common combo statuses so reaction hooks can be observed.',
    playerHealthFraction: 0.55,
    enemyHealthFraction: 0.45,
    enemyHealthMultiplier: 26,
    enemyDamageMultiplier: 0.25,
    targetEffects: ['burn', 'dot', 'freeze', 'marked', 'poison', 'slow', 'stun', 'taunt', 'waterWeakness'],
    casterEffects: ['arcaneCharge', 'invisible'],
    timeoutMs: DEFAULT_FOCUS_TIMEOUT_MS,
  };
}

function skillFocusExercises(scenario: PveScenarioDefinition & { specializationId: SpecializationId }): SpecializationAiExerciseDefinition[] {
  const profile: SpecializationAiProfile = SPECIALIZATION_AI_PROFILES[scenario.specializationId];
  const unlocked = new Set(unlockedSkillsForSimProfile(scenario));
  const exercises: SpecializationAiExerciseDefinition[] = [];
  const seen = new Set<SkillId>();

  profile.rules.forEach((rule, index) => {
    if (seen.has(rule.skillId) || !unlocked.has(rule.skillId)) return;
    seen.add(rule.skillId);
    exercises.push(skillFocusExercise(scenario, rule, index));
  });

  return exercises;
}

function skillFocusExercise(
  scenario: PveScenarioDefinition & { specializationId: SpecializationId },
  rule: SkillUseRule,
  ruleIndex: number,
): SpecializationAiExerciseDefinition {
  const profile: SpecializationAiProfile = SPECIALIZATION_AI_PROFILES[scenario.specializationId];
  const earlierSkillIds = profile.rules.slice(0, ruleIndex).map((candidate) => candidate.skillId);
  const reactionConditions = SKILL_REACTIONS[rule.skillId]?.map((reaction) => reaction.condition) ?? [];
  const mergedConditions = [rule.when, ...reactionConditions].filter((condition): condition is SkillUseCondition => Boolean(condition));
  const targetEffects = unique(mergedConditions.map((condition) => condition.targetHasEffect));
  const casterEffects = unique(mergedConditions.map((condition) => condition.casterHasEffect));

  return {
    ...scenario,
    id: `${scenario.id}-focus-${rule.skillId}`,
    exerciseKind: 'skill_focus',
    purpose: `Forces higher-priority rules onto cooldown so ${rule.skillId} must be selected when its preconditions are true.`,
    focusSkillId: rule.skillId,
    playerHealthFraction: focusHealthFraction(mergedConditions, 'caster'),
    enemyHealthFraction: focusHealthFraction(mergedConditions, 'target'),
    enemyHealthMultiplier: focusEnemyHealthMultiplier(rule.skillId),
    enemyDamageMultiplier: 0.15,
    targetEffects,
    casterEffects,
    cooldownSkillIds: unique(earlierSkillIds),
    cooldownLockMs: DEFAULT_COOLDOWN_LOCK_MS,
    timeoutMs: DEFAULT_FOCUS_TIMEOUT_MS,
  };
}

function focusEnemyHealthMultiplier(skillId: SkillId): number {
  const skill = SKILLS[skillId];
  if (skill?.kind === 'utility') return 12;
  return 30;
}

function focusHealthFraction(
  conditions: readonly SkillUseCondition[],
  entity: 'caster' | 'target',
): number | undefined {
  const belowValues = conditions
    .map((condition) => entity === 'caster' ? condition.casterHealthBelowPct : condition.targetHealthBelowPct)
    .filter((value): value is number => value !== undefined);
  if (belowValues.length > 0) return Math.max(0.1, Math.min(...belowValues) - 0.08);

  const aboveValues = conditions
    .map((condition) => entity === 'caster' ? condition.casterHealthAbovePct : condition.targetHealthAbovePct)
    .filter((value): value is number => value !== undefined);
  if (aboveValues.length > 0) return Math.min(0.95, Math.max(...aboveValues) + 0.08);

  return undefined;
}

function unique<T extends string>(values: readonly (T | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))];
}
