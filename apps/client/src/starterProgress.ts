import type { SkillId } from '../../../packages/content/skills';
import {
  createStarterProgressState,
  normalizeStarterProgressState,
  type StarterProgressState,
} from '../../../packages/protocol/messages';
import type { PlayerEntity, StarterProgress } from './gameTypes';

export function createInitialStarterProgress(): StarterProgress {
  return createStarterProgressState();
}

export function normalizeClientStarterProgress(
  progress: unknown,
  player?: PlayerEntity | null,
): StarterProgressState {
  return normalizeStarterProgressState(progress, {
    levelReached: player?.level ?? undefined,
    learnedSkills: player?.unlockedSkills.length ?? undefined,
  });
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
