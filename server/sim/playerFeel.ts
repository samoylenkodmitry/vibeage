import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { QUESTS } from '../../packages/content/quests.js';
import {
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
  SPECIALIZATIONS,
  type SpecializationId,
} from '../../packages/content/specializations.js';
import { type SkillId } from '../../packages/content/skills.js';
import { getExperienceToNextLevel } from '../players/playerProgression.js';
import { createSimulatedEnemy } from './gameSimulator.js';
import { runPveScenario, type PveScenarioDefinition } from './scenarioCatalog.js';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_KILL_OVERHEAD_MS = 30_000;
const DEFAULT_MAX_LEVEL = 60;
const DEFAULT_ENEMY_TYPE = 'goblin';
const killCycleCache = new Map<string, number>();

export type FeelBeatKind =
  | 'start'
  | 'level'
  | 'skill'
  | 'quest'
  | 'specialization'
  | 'proficiency';

export type FeelBeat = {
  atMs: number;
  kind: FeelBeatKind;
  label: string;
  weight: number;
};

export type FeelWindowSummary = {
  index: number;
  startHour: number;
  endHour: number;
  beatCount: number;
  beatWeight: number;
  kinds: FeelBeatKind[];
  isEmpty: boolean;
};

export type PlayerFeelOptions = {
  className: CharacterClass;
  specializationId?: SpecializationId;
  horizonHours?: number;
  windowHours?: number;
  startingLevel?: number;
  enemyType?: string;
  killOverheadMs?: number;
  maxLevel?: number;
};

export type PlayerFeelSummary = {
  className: CharacterClass;
  specializationId?: SpecializationId;
  horizonHours: number;
  windowHours: number;
  endingLevel: number;
  levelsGained: number;
  kills: number;
  killsPerHour: number;
  attentionGapMinutes: number;
  feelScore: number;
  meaningfulBeatWeight: number;
  meaningfulBeatsPerWindow: number;
  maxMeaningfulGapHours: number;
  windowCount: number;
  emptyWindowCount: number;
  longestEmptyWindowStreak: number;
  lowestWindowBeatWeight: number;
  emptyRisk: 'low' | 'medium' | 'high';
  beatCounts: Record<FeelBeatKind, number>;
  mitigationHints: string[];
  windows: FeelWindowSummary[];
  beats: FeelBeat[];
};

type FeelProgress = {
  elapsedMs: number;
  level: number;
  xpIntoLevel: number;
  kills: number;
  maxKillCycleMs: number;
  unlockedSkills: Set<SkillId>;
  beats: FeelBeat[];
};

export function estimatePlayerFeel(options: PlayerFeelOptions): PlayerFeelSummary {
  const horizonHours = options.horizonHours ?? 1;
  const windowHours = options.windowHours ?? 1;
  const progress = createFeelProgress(options);
  const horizonMs = horizonHours * HOUR_MS;

  while (progress.elapsedMs < horizonMs && progress.level < (options.maxLevel ?? DEFAULT_MAX_LEVEL)) {
    advanceOneLevelOrHorizon(progress, options, horizonMs);
  }

  return summarizeFeel(options, progress, horizonHours, windowHours);
}

export function estimateFeelForClasses(horizonHours: readonly number[]): PlayerFeelSummary[] {
  const classNames = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
  return classNames.flatMap((className) => (
    horizonHours.map((hours) => estimatePlayerFeel({ className, horizonHours: hours }))
  ));
}

export function estimateFeelForSpecializations(horizonHours: readonly number[]): PlayerFeelSummary[] {
  return Object.values(SPECIALIZATIONS).flatMap((spec) => (
    horizonHours.map((hours) => (
      estimatePlayerFeel({
        className: spec.baseClass,
        specializationId: spec.id,
        horizonHours: hours,
      })
    ))
  ));
}

function createFeelProgress(options: PlayerFeelOptions): FeelProgress {
  const level = options.startingLevel ?? 1;
  const unlockedSkills = new Set<SkillId>();
  const beats = startingBeats(options.className, level, options.specializationId, unlockedSkills);
  return {
    elapsedMs: 0,
    level,
    xpIntoLevel: 0,
    kills: 0,
    maxKillCycleMs: 0,
    unlockedSkills,
    beats,
  };
}

function advanceOneLevelOrHorizon(progress: FeelProgress, options: PlayerFeelOptions, horizonMs: number): void {
  const cycleMs = killCycleMs(
    options.className,
    options.specializationId,
    progress.level,
    options.enemyType,
    options.killOverheadMs,
  );
  const xpPerKill = createSimulatedEnemy(options.enemyType ?? DEFAULT_ENEMY_TYPE, progress.level).baseExperienceValue;
  const xpNeeded = getExperienceToNextLevel(progress.level) - progress.xpIntoLevel;
  const killsToLevel = xpNeeded <= 0 ? 0 : Math.max(1, Math.ceil(xpNeeded / xpPerKill));
  const timeToLevelMs = killsToLevel * cycleMs;
  progress.maxKillCycleMs = Math.max(progress.maxKillCycleMs, cycleMs);

  if (progress.elapsedMs + timeToLevelMs > horizonMs) {
    const remainingMs = horizonMs - progress.elapsedMs;
    const partialKills = Math.floor(remainingMs / cycleMs);
    progress.kills += partialKills;
    progress.xpIntoLevel += partialKills * xpPerKill;
    progress.elapsedMs = horizonMs;
    return;
  }

  progress.elapsedMs += timeToLevelMs;
  progress.kills += killsToLevel;
  progress.xpIntoLevel = (progress.xpIntoLevel + killsToLevel * xpPerKill) - getExperienceToNextLevel(progress.level);
  progress.level += 1;
  addLevelBeats(progress, options.className, options.specializationId);
}

function addLevelBeats(progress: FeelProgress, className: CharacterClass, specializationId?: SpecializationId): void {
  pushBeat(progress.beats, progress.elapsedMs, 'level', `Reached level ${progress.level}`, 3);
  for (const skillId of newlyUnlockedSkills(className, progress.level, progress.unlockedSkills)) {
    pushBeat(progress.beats, progress.elapsedMs, 'skill', `Unlocked ${skillId}`, 2);
    progress.unlockedSkills.add(skillId);
  }
  for (const quest of Object.values(QUESTS).filter((q) => q.minLevel === progress.level)) {
    pushBeat(progress.beats, progress.elapsedMs, 'quest', `Quest available: ${quest.name}`, 1.5);
  }
  if (progress.level === SPECIALIZATION_UNLOCK_LEVEL) {
    const spec = specializationForClass(className, specializationId);
    const label = spec ? `Specialization active: ${spec.name}` : 'Specialization choice available';
    pushBeat(progress.beats, progress.elapsedMs, 'specialization', label, 4);
    if (spec) {
      pushBeat(progress.beats, progress.elapsedMs, 'specialization', `Passive active: ${spec.specializationPassive.name}`, 2);
      for (const skillId of spec.specSkills ?? []) {
        pushBeat(progress.beats, progress.elapsedMs, 'skill', `Unlocked ${skillId}`, 2);
        progress.unlockedSkills.add(skillId);
      }
    }
  }
  if (progress.level === PROFICIENCY_LEVEL) {
    pushBeat(progress.beats, progress.elapsedMs, 'proficiency', 'Proficiency tier available', 4);
    const spec = specializationForClass(className, specializationId);
    if (spec) {
      pushBeat(progress.beats, progress.elapsedMs, 'proficiency', `Passive active: ${spec.proficiencyPassive.name}`, 2);
      for (const skillId of spec.proficiencySkills ?? []) {
        pushBeat(progress.beats, progress.elapsedMs, 'skill', `Unlocked ${skillId}`, 2);
        progress.unlockedSkills.add(skillId);
      }
    }
  }
}

function startingBeats(
  className: CharacterClass,
  level: number,
  specializationId: SpecializationId | undefined,
  unlockedSkills: Set<SkillId>,
): FeelBeat[] {
  const beats: FeelBeat[] = [];
  pushBeat(beats, 0, 'start', 'Session started', 0);
  for (const skillId of skillsUnlockedAtOrBefore(className, level)) {
    pushBeat(beats, 0, 'skill', `Starts with ${skillId}`, 1);
    unlockedSkills.add(skillId);
  }
  for (const quest of Object.values(QUESTS).filter((q) => q.minLevel <= level)) {
    pushBeat(beats, 0, 'quest', `Quest available: ${quest.name}`, 1);
  }
  const spec = specializationForClass(className, specializationId);
  if (level >= SPECIALIZATION_UNLOCK_LEVEL && spec) {
    pushBeat(beats, 0, 'specialization', `Specialization active: ${spec.name}`, 2);
    pushBeat(beats, 0, 'specialization', `Passive active: ${spec.specializationPassive.name}`, 1);
    for (const skillId of spec.specSkills ?? []) {
      pushBeat(beats, 0, 'skill', `Starts with ${skillId}`, 1);
      unlockedSkills.add(skillId);
    }
  }
  if (level >= PROFICIENCY_LEVEL && spec) {
    pushBeat(beats, 0, 'proficiency', `Passive active: ${spec.proficiencyPassive.name}`, 1);
    for (const skillId of spec.proficiencySkills ?? []) {
      pushBeat(beats, 0, 'skill', `Starts with ${skillId}`, 1);
      unlockedSkills.add(skillId);
    }
  }
  return beats;
}

function specializationForClass(className: CharacterClass, specializationId?: SpecializationId) {
  if (!specializationId) return undefined;
  const spec = SPECIALIZATIONS[specializationId];
  return spec?.baseClass === className ? spec : undefined;
}

function skillsUnlockedAtOrBefore(className: CharacterClass, level: number): SkillId[] {
  return Object.entries(CLASS_SKILL_TREES[className].skillProgression)
    .filter(([, req]) => req && req.level <= level)
    .map(([skillId]) => skillId as SkillId);
}

function newlyUnlockedSkills(className: CharacterClass, level: number, unlocked: Set<SkillId>): SkillId[] {
  return Object.entries(CLASS_SKILL_TREES[className].skillProgression)
    .filter(([, req]) => req?.level === level)
    .map(([skillId]) => skillId as SkillId)
    .filter((skillId) => !unlocked.has(skillId));
}

function killCycleMs(
  className: CharacterClass,
  specializationId: SpecializationId | undefined,
  level: number,
  enemyType = DEFAULT_ENEMY_TYPE,
  killOverheadMs = DEFAULT_KILL_OVERHEAD_MS,
): number {
  const resolvedSpecId = level >= SPECIALIZATION_UNLOCK_LEVEL ? specializationId : undefined;
  const cacheKey = [className, resolvedSpecId ?? 'base', level, enemyType, killOverheadMs].join(':');
  const cached = killCycleCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const scenario: PveScenarioDefinition = {
    id: `feel-${className}-l${level}-${enemyType}`,
    className,
    level,
    enemyType,
    enemyLevel: level,
  };
  if (resolvedSpecId) {
    scenario.specializationId = resolvedSpecId;
  }
  const result = runPveScenario(scenario);
  const durationMs = Math.max(1000, result.durationMs) + killOverheadMs;
  killCycleCache.set(cacheKey, durationMs);
  return durationMs;
}

function summarizeFeel(
  options: PlayerFeelOptions,
  progress: FeelProgress,
  horizonHours: number,
  windowHours: number,
): PlayerFeelSummary {
  const horizonMs = horizonHours * HOUR_MS;
  const windowMs = windowHours * HOUR_MS;
  const meaningfulBeatWeight = progress.beats.reduce((total, beat) => total + beat.weight, 0);
  const maxGapMs = maxMeaningfulGap(progress.beats, horizonMs);
  const windows = summarizeWindows(progress.beats, horizonMs, windowMs);
  const windowStats = summarizeWindowStats(windows);
  const beatsPerWindow = meaningfulBeatWeight / Math.max(1, horizonMs / windowMs);
  const score = feelScore(maxGapMs, beatsPerWindow, progress.maxKillCycleMs, windowStats, windowMs);
  const risk = emptyRisk(maxGapMs, beatsPerWindow, windowStats, score, windowMs);
  return {
    className: options.className,
    specializationId: options.specializationId,
    horizonHours,
    windowHours,
    endingLevel: progress.level,
    levelsGained: progress.level - (options.startingLevel ?? 1),
    kills: progress.kills,
    killsPerHour: progress.kills / Math.max(0.01, horizonHours),
    attentionGapMinutes: progress.maxKillCycleMs / 60_000,
    feelScore: score,
    meaningfulBeatWeight,
    meaningfulBeatsPerWindow: beatsPerWindow,
    maxMeaningfulGapHours: maxGapMs / HOUR_MS,
    windowCount: windows.length,
    emptyWindowCount: windowStats.emptyWindowCount,
    longestEmptyWindowStreak: windowStats.longestEmptyWindowStreak,
    lowestWindowBeatWeight: windowStats.lowestWindowBeatWeight,
    emptyRisk: risk,
    beatCounts: beatCounts(progress.beats),
    mitigationHints: mitigationHints(risk, maxGapMs, beatsPerWindow, progress.maxKillCycleMs, windowStats, windowMs),
    windows,
    beats: progress.beats,
  };
}

function summarizeWindows(beats: readonly FeelBeat[], horizonMs: number, windowMs: number): FeelWindowSummary[] {
  const windowCount = Math.max(1, Math.ceil(horizonMs / windowMs));
  return Array.from({ length: windowCount }, (_, index) => {
    const startMs = index * windowMs;
    const endMs = Math.min(horizonMs, startMs + windowMs);
    const windowBeats = beats.filter((beat) => beat.weight > 0 && beat.atMs >= startMs && beat.atMs < endMs);
    const kinds = [...new Set(windowBeats.map((beat) => beat.kind))];
    const beatWeight = windowBeats.reduce((total, beat) => total + beat.weight, 0);
    return {
      index,
      startHour: startMs / HOUR_MS,
      endHour: endMs / HOUR_MS,
      beatCount: windowBeats.length,
      beatWeight,
      kinds,
      isEmpty: beatWeight <= 0,
    };
  });
}

type WindowStats = {
  windowCount: number;
  emptyWindowCount: number;
  longestEmptyWindowStreak: number;
  lowestWindowBeatWeight: number;
};

function summarizeWindowStats(windows: readonly FeelWindowSummary[]): WindowStats {
  let currentEmptyStreak = 0;
  let longestEmptyWindowStreak = 0;
  let lowestWindowBeatWeight = Number.POSITIVE_INFINITY;
  let emptyWindowCount = 0;

  for (const window of windows) {
    lowestWindowBeatWeight = Math.min(lowestWindowBeatWeight, window.beatWeight);
    if (window.isEmpty) {
      emptyWindowCount += 1;
      currentEmptyStreak += 1;
      longestEmptyWindowStreak = Math.max(longestEmptyWindowStreak, currentEmptyStreak);
    } else {
      currentEmptyStreak = 0;
    }
  }

  return {
    windowCount: windows.length,
    emptyWindowCount,
    longestEmptyWindowStreak,
    lowestWindowBeatWeight: Number.isFinite(lowestWindowBeatWeight) ? lowestWindowBeatWeight : 0,
  };
}

function maxMeaningfulGap(beats: readonly FeelBeat[], horizonMs: number): number {
  const times = beats.filter((beat) => beat.weight > 0).map((beat) => beat.atMs).sort((a, b) => a - b);
  if (times.length === 0) return horizonMs;
  let previous = 0;
  let maxGap = times[0];
  for (const time of times) {
    maxGap = Math.max(maxGap, time - previous);
    previous = time;
  }
  return Math.max(maxGap, horizonMs - previous);
}

function feelScore(
  maxGapMs: number,
  beatsPerWindow: number,
  attentionGapMs: number,
  windowStats: WindowStats,
  windowMs: number,
): number {
  const windowCount = Math.max(1, windowStats.windowCount);
  const emptyWindowPenalty = (windowStats.emptyWindowCount / windowCount) * 45;
  const streakPenalty = (windowStats.longestEmptyWindowStreak / windowCount) * 20;
  const gapPenalty = Math.min(30, (maxGapMs / windowMs) * 15);
  const densityPenalty = Math.max(0, 2 - beatsPerWindow) * 8;
  const attentionPenalty = Math.min(10, Math.max(0, (attentionGapMs - 2 * 60_000) / (6 * 60_000)) * 10);
  const score = 100 - emptyWindowPenalty - streakPenalty - gapPenalty - densityPenalty - attentionPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function emptyRisk(
  maxGapMs: number,
  beatsPerWindow: number,
  windowStats: WindowStats,
  score: number,
  windowMs: number,
): PlayerFeelSummary['emptyRisk'] {
  if (windowStats.emptyWindowCount > 0 || maxGapMs > windowMs || beatsPerWindow < 1 || score < 50) return 'high';
  if (maxGapMs > windowMs * 0.5 || beatsPerWindow < 2 || score < 75) return 'medium';
  return 'low';
}

function mitigationHints(
  risk: PlayerFeelSummary['emptyRisk'],
  maxGapMs: number,
  beatsPerWindow: number,
  attentionGapMs: number,
  windowStats: WindowStats,
  windowMs: number,
): string[] {
  if (risk === 'low') return ['Cadence is within current targets.'];
  const hints: string[] = [];
  if (windowStats.emptyWindowCount > 0) hints.push('Fill empty windows with quest steps, unlock previews, crafting goals, reputation, or set-piece progress.');
  if (maxGapMs > windowMs) hints.push('Add a quest, skill, vendor/crafting goal, or milestone inside the longest dry gap.');
  if (beatsPerWindow < 1) hints.push('Guarantee at least one meaningful progression beat per target window.');
  if (attentionGapMs > 2 * 60_000) hints.push('Shorten travel/search downtime or add ambient encounters between kills.');
  if (hints.length === 0) hints.push('Add optional side goals to raise beat density.');
  return hints;
}

function beatCounts(beats: readonly FeelBeat[]): Record<FeelBeatKind, number> {
  return {
    start: countKind(beats, 'start'),
    level: countKind(beats, 'level'),
    skill: countKind(beats, 'skill'),
    quest: countKind(beats, 'quest'),
    specialization: countKind(beats, 'specialization'),
    proficiency: countKind(beats, 'proficiency'),
  };
}

function countKind(beats: readonly FeelBeat[], kind: FeelBeatKind): number {
  return beats.filter((beat) => beat.kind === kind).length;
}

function pushBeat(beats: FeelBeat[], atMs: number, kind: FeelBeatKind, label: string, weight: number): void {
  beats.push({ atMs, kind, label, weight });
}
