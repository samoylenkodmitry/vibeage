import { z } from 'zod';

export const STARTER_PATH_GOALS = {
  defeatedEnemies: 3,
  lootPickups: 3,
  levelReached: 2,
} as const;

export const STARTER_PATH_REWARD = {
  skillPoints: 1,
} as const;

export const starterProgressStateSchema = z.object({
  defeatedEnemies: z.number().int().min(0),
  defeatedEnemyIds: z.array(z.string()),
  lootPickups: z.number().int().min(0),
  levelReached: z.number().int().min(1),
  learnedSkills: z.number().int().min(0),
  isComplete: z.boolean(),
  rewardGranted: z.boolean(),
}).passthrough();

export type StarterProgressState = z.infer<typeof starterProgressStateSchema>;

export function isStarterProgressComplete(progress: Pick<
  StarterProgressState,
  'defeatedEnemies' | 'lootPickups' | 'levelReached'
>): boolean {
  return progress.defeatedEnemies >= STARTER_PATH_GOALS.defeatedEnemies
    && progress.lootPickups >= STARTER_PATH_GOALS.lootPickups
    && progress.levelReached >= STARTER_PATH_GOALS.levelReached;
}

export function createStarterProgressState(
  overrides: Partial<StarterProgressState> = {},
): StarterProgressState {
  return normalizeStarterProgressState(overrides);
}

export function normalizeStarterProgressState(
  rawValue: unknown,
  derived: Partial<Pick<StarterProgressState, 'levelReached' | 'learnedSkills'>> = {},
): StarterProgressState {
  const value = readProgressObject(rawValue);
  const defeatedEnemyIds = normalizeStringArray(value.defeatedEnemyIds);
  const defeatedEnemies = Math.max(
    nonNegativeInt(value.defeatedEnemies, 0),
    defeatedEnemyIds.length,
  );
  const progress = {
    defeatedEnemies,
    defeatedEnemyIds,
    lootPickups: nonNegativeInt(value.lootPickups, 0),
    levelReached: Math.max(1, nonNegativeInt(value.levelReached, 1), derived.levelReached ?? 1),
    learnedSkills: Math.max(0, nonNegativeInt(value.learnedSkills, 0), derived.learnedSkills ?? 0),
    rewardGranted: value.rewardGranted === true,
    isComplete: false,
  };

  return {
    ...progress,
    isComplete: isStarterProgressComplete(progress),
  };
}

function readProgressObject(rawValue: unknown): Record<string, unknown> {
  let current = rawValue;

  while (typeof current === 'string') {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return {};
    }
  }

  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    return {};
  }

  return current as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}
