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

