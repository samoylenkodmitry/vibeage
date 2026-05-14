import type { SkillId } from '../../packages/content/skills.js';
import { canLearnSkill, type CharacterClass } from '../../packages/content/classes.js';
import type { LearnSkill, SetSkillShortcut } from '../../packages/protocol/messages.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { debug, error as logError, LOG_CATEGORIES, warn } from '../logger.js';
import { findPlayerIdBySocket } from './playerSession.js';
import { emitStarterProgressUpdate, syncPlayerStarterProgress } from '../progression/starterPath.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';

type SkillClient = { id: string };

type SkillPlayer = {
  id: string;
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
};

export function onLearnSkill(
  socket: SkillClient,
  direct: DirectMessageSink,
  outbound: OutboundEventSink,
  state: GameState,
  msg: LearnSkill,
): void {
  const player = findPlayerBySocket(state, socket.id);
  if (!player) {
    warn(LOG_CATEGORIES.SKILL, `Learn skill request from unknown socket: ${socket.id}`);
    return;
  }

  if (player.unlockedSkills.includes(msg.skillId)) {
    sendSkillLearned(direct, msg.skillId, player.availableSkillPoints);
    return;
  }

  if (!learnNewSkill(player, msg.skillId)) {
    warn(LOG_CATEGORIES.SKILL, `Player ${player.id} cannot learn skill: ${msg.skillId}`);
    return;
  }

  const starterProgress = syncPlayerStarterProgress(player);
  sendSkillLearned(direct, msg.skillId, player.availableSkillPoints);
  emitPlayerUpdated(outbound, {
    id: player.id,
    unlockedSkills: player.unlockedSkills,
    skillShortcuts: player.skillShortcuts,
    availableSkillPoints: player.availableSkillPoints,
  });
  emitStarterProgressUpdate(outbound, player, starterProgress.rewardGranted);
}

export function onSetSkillShortcut(
  socket: SkillClient,
  direct: DirectMessageSink,
  outbound: OutboundEventSink,
  state: GameState,
  msg: SetSkillShortcut,
): void {
  const player = findPlayerBySocket(state, socket.id);
  if (!player) {
    warn(LOG_CATEGORIES.SKILL, `Set skill shortcut request from unknown socket: ${socket.id}`);
    return;
  }

  if (!setSkillShortcut(player, msg.slotIndex, msg.skillId)) {
    warn(LOG_CATEGORIES.SKILL, `Invalid skill shortcut change for player ${player.id}`);
    return;
  }

  direct.send({
    type: 'SkillShortcutUpdated',
    slotIndex: msg.slotIndex,
    skillId: msg.skillId,
  });
  emitPlayerUpdated(outbound, {
    id: player.id,
    skillShortcuts: player.skillShortcuts,
  });
}

export function canPlayerLearnSkill(player: SkillPlayer, skillId: SkillId): boolean {
  if (player.availableSkillPoints <= 0 || player.unlockedSkills.includes(skillId)) {
    return false;
  }

  return canLearnSkill(
    skillId,
    player.className as CharacterClass,
    player.level,
    player.unlockedSkills,
  );
}

export function learnNewSkill(player: SkillPlayer, skillId: SkillId): boolean {
  try {
    if (player.unlockedSkills.includes(skillId)) {
      return true;
    }

    if (!canPlayerLearnSkill(player, skillId)) {
      return false;
    }

    const previousSkillPoints = player.availableSkillPoints;
    player.unlockedSkills.push(skillId);
    player.availableSkillPoints -= 1;
    assignFirstEmptyShortcut(player, skillId);
    debug(LOG_CATEGORIES.SKILL, `Player ${player.id} learned ${skillId}`, {
      skillPoints: `${previousSkillPoints} -> ${player.availableSkillPoints}`,
    });
    return true;
  } catch (error) {
    logError(LOG_CATEGORIES.SKILL, `Error learning skill ${skillId}`, error);
    return false;
  }
}

export function setSkillShortcut(
  player: SkillPlayer,
  slotIndex: number,
  skillId: SkillId | null,
): boolean {
  try {
    if (!isValidShortcutSlot(slotIndex) || (skillId !== null && !player.unlockedSkills.includes(skillId))) {
      return false;
    }

    if (skillId !== null) {
      clearDuplicateShortcut(player, slotIndex, skillId);
    }

    player.skillShortcuts[slotIndex] = skillId;
    return true;
  } catch (error) {
    logError(LOG_CATEGORIES.SKILL, 'Error setting skill shortcut', error);
    return false;
  }
}

function findPlayerBySocket(state: GameState, socketId: string): PlayerState | undefined {
  const playerId = findPlayerIdBySocket(state, socketId);
  return playerId ? state.players[playerId] : undefined;
}

function assignFirstEmptyShortcut(player: SkillPlayer, skillId: SkillId): void {
  const emptySlotIndex = player.skillShortcuts.findIndex((slot) => slot === null);
  if (!player.skillShortcuts.includes(skillId) && emptySlotIndex !== -1) {
    player.skillShortcuts[emptySlotIndex] = skillId;
  }
}

function clearDuplicateShortcut(player: SkillPlayer, slotIndex: number, skillId: SkillId): void {
  const existingIndex = player.skillShortcuts.findIndex((id) => id === skillId);
  if (existingIndex !== -1 && existingIndex !== slotIndex) {
    player.skillShortcuts[existingIndex] = null;
  }
}

function sendSkillLearned(direct: DirectMessageSink, skillId: SkillId, remainingPoints: number): void {
  direct.send({
    type: 'SkillLearned',
    skillId,
    remainingPoints,
  });
}

function isValidShortcutSlot(slotIndex: number): boolean {
  return slotIndex >= 0 && slotIndex <= 8;
}
