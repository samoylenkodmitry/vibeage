import {
  STARTER_PATH_REWARD,
  createStarterProgressState,
  normalizeStarterProgressState,
  type StarterProgressState,
  type StarterProgressUpdate,
} from '../../packages/protocol/messages.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import {
  emitServerMessageToClient,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';

export type StarterProgressResult = {
  progress: StarterProgressState;
  rewardGranted: boolean;
};

export function createInitialPlayerStarterProgress(player?: Pick<PlayerState, 'level' | 'unlockedSkills'>): StarterProgressState {
  return createStarterProgressState({
    levelReached: player?.level ?? 1,
    learnedSkills: player?.unlockedSkills.length ?? 0,
  });
}

export function syncPlayerStarterProgress(player: PlayerState): StarterProgressResult {
  return applyStarterProgress(player, getNormalizedPlayerProgress(player));
}

export function recordStarterEnemyDefeat(player: PlayerState, enemyId: string): StarterProgressResult {
  const current = getNormalizedPlayerProgress(player);
  if (current.defeatedEnemyIds.includes(enemyId)) {
    return applyStarterProgress(player, current);
  }

  return applyStarterProgress(player, {
    ...current,
    defeatedEnemyIds: [...current.defeatedEnemyIds, enemyId],
    defeatedEnemies: current.defeatedEnemies + 1,
  });
}

export function recordStarterLootPickup(player: PlayerState, itemCount: number): StarterProgressResult {
  const current = getNormalizedPlayerProgress(player);
  return applyStarterProgress(player, {
    ...current,
    lootPickups: current.lootPickups + Math.max(0, Math.floor(itemCount)),
  });
}

export function makeStarterProgressUpdate(
  player: PlayerState,
  rewardGranted = false,
): StarterProgressUpdate {
  const result = syncPlayerStarterProgress(player);
  return {
    type: 'StarterProgressUpdate',
    progress: result.progress,
    rewardGranted: rewardGranted || result.rewardGranted,
  };
}

export function sendStarterProgressUpdate(
  sink: DirectMessageSink,
  player: PlayerState,
  rewardGranted = false,
): void {
  sink.send(makeStarterProgressUpdate(player, rewardGranted));
}

export function emitStarterProgressUpdate(
  sink: OutboundEventSink,
  player: PlayerState,
  rewardGranted = false,
): void {
  emitServerMessageToClient(sink, player.socketId, makeStarterProgressUpdate(player, rewardGranted));
}

function getNormalizedPlayerProgress(player: PlayerState): StarterProgressState {
  return normalizeStarterProgressState(player.starterProgress, {
    levelReached: player.level,
    learnedSkills: player.unlockedSkills.length,
  });
}

function applyStarterProgress(player: PlayerState, nextProgress: StarterProgressState): StarterProgressResult {
  const progress = normalizeStarterProgressState(nextProgress, {
    levelReached: player.level,
    learnedSkills: player.unlockedSkills.length,
  });
  if (progress.isComplete && !progress.rewardGranted) {
    progress.rewardGranted = true;
    player.availableSkillPoints += STARTER_PATH_REWARD.skillPoints;
    player.starterProgress = progress;
    return { progress, rewardGranted: true };
  }

  player.starterProgress = progress;
  return { progress, rewardGranted: false };
}
