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
  // unlockedSkills can be missing despite the type: during a relogin race the
  // server can briefly snapshot YOUR player through the public-player filter
  // (PUBLIC_PLAYER_FIELDS has no owner-only fields) until the session takeover
  // lands. Crashed the whole client behind GameErrorBoundary; stay defensive
  // and let the next owner snapshot fill the real count.
  return normalizeStarterProgressState(progress, {
    levelReached: player?.level ?? undefined,
    learnedSkills: player?.unlockedSkills?.length ?? undefined,
  });
}

