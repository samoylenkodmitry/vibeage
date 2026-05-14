import type { SkillId } from '../../../packages/content/skills';
import type { EnemyEntity, StarterProgress } from './gameTypes';

export function createInitialStarterProgress(): StarterProgress {
  return {
    defeatedEnemies: 0,
    defeatedEnemyIds: [],
    lootPickups: 0,
    levelReached: 1,
    learnedSkills: 0,
  };
}

export function updateProgressLevel(progress: StarterProgress, level: number): StarterProgress {
  return {
    ...progress,
    levelReached: Math.max(progress.levelReached, level),
  };
}

export function updateProgressLearnedSkills(
  progress: StarterProgress,
  skillCount: number,
): StarterProgress {
  return {
    ...progress,
    learnedSkills: Math.max(progress.learnedSkills, skillCount),
  };
}

export function updateProgressLoot(progress: StarterProgress, itemCount: number): StarterProgress {
  return {
    ...progress,
    lootPickups: progress.lootPickups + itemCount,
  };
}

export function updateProgressDefeats(
  progress: StarterProgress,
  enemies: Record<string, EnemyEntity>,
  targetIds: string[],
): StarterProgress {
  const defeatedIds = targetIds.filter((targetId) => {
    const enemy = enemies[targetId];
    return enemy && !enemy.isAlive && !progress.defeatedEnemyIds.includes(targetId);
  });

  if (defeatedIds.length === 0) {
    return progress;
  }

  return {
    ...progress,
    defeatedEnemies: progress.defeatedEnemies + defeatedIds.length,
    defeatedEnemyIds: [...progress.defeatedEnemyIds, ...defeatedIds],
  };
}

export function assignFirstEmptyShortcut(
  shortcuts: Array<SkillId | null>,
  skillId: SkillId,
): Array<SkillId | null> {
  const nextShortcuts = [...shortcuts];
  const emptySlotIndex = nextShortcuts.findIndex((slot) => slot === null);
  if (emptySlotIndex >= 0) {
    nextShortcuts[emptySlotIndex] = skillId;
  }
  return nextShortcuts;
}
