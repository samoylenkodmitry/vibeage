import type { SkillId } from '../packages/content/skills.js';
import type { LearnSkill, SetSkillShortcut } from '../packages/protocol/messages.js';
import type { PlayerState } from '../packages/sim/entities.js';

import { debug, LOG_CATEGORIES, warn } from './logger.js';
import { canPlayerLearnSkill, learnNewSkill, setSkillShortcut } from './skillManager.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from './transport/outboundEvents.js';
import { emitStarterProgressUpdate, syncPlayerStarterProgress } from './progression/starterPath.js';

interface GameState {
  players: Record<string, PlayerState>;
}

type SkillClient = { id: string };

/**
 * Handle the LearnSkill message 
 */
export function onLearnSkill(
  socket: SkillClient,
  direct: DirectMessageSink,
  outbound: OutboundEventSink,
  state: GameState,
  msg: LearnSkill,
): void {
  debug(LOG_CATEGORIES.SKILL, `Received LearnSkill request for skill: ${msg.skillId}`);

  const player = findPlayerBySocket(state, socket.id);
  if (!player) {
    warn(LOG_CATEGORIES.SKILL, `Learn skill request from unknown socket: ${socket.id}`);
    return;
  }

  debug(LOG_CATEGORIES.SKILL, `Player ${player.id} skill state`, {
    className: player.className,
    level: player.level,
    unlockedSkills: player.unlockedSkills,
    availableSkillPoints: player.availableSkillPoints
  });

  // Skip if player already has this skill
  if (player.unlockedSkills.includes(msg.skillId)) {
    debug(LOG_CATEGORIES.SKILL, `Player ${player.id} already has skill: ${msg.skillId}`);
    sendSkillLearned(direct, msg.skillId, player.availableSkillPoints);
    return;
  }

  // Validate player has skill points to spend
  if (player.availableSkillPoints <= 0) {
    warn(LOG_CATEGORIES.SKILL, `Player ${player.id} has no skill points to learn ${msg.skillId}`);
    return;
  }

  // Check if player can learn this skill based on class and level requirements
  if (!canPlayerLearnSkill(player, msg.skillId)) {
    warn(LOG_CATEGORIES.SKILL, `Player ${player.id} cannot learn skill: ${msg.skillId}`);
    return;
  }

  // Learn the skill using skillManager function
  if (!learnNewSkill(player, msg.skillId)) {
    warn(LOG_CATEGORIES.SKILL, `Failed to learn skill ${msg.skillId} for player ${player.id}`);
    return;
  }

  debug(LOG_CATEGORIES.SKILL, `Player ${player.id} learned skill: ${msg.skillId}`);
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

/**
 * Handle the SetSkillShortcut message
 */
export function onSetSkillShortcut(
  socket: SkillClient,
  direct: DirectMessageSink,
  outbound: OutboundEventSink,
  state: GameState,
  msg: SetSkillShortcut,
): void {
  debug(LOG_CATEGORIES.SKILL, `Received SetSkillShortcut request for slot ${msg.slotIndex}: ${msg.skillId}`);

  const player = findPlayerBySocket(state, socket.id);
  if (!player) {
    warn(LOG_CATEGORIES.SKILL, `Set skill shortcut request from unknown socket: ${socket.id}`);
    return;
  }

  // Validate slot index is valid (0-8 for keys 1-9)
  if (!isValidShortcutSlot(msg.slotIndex)) {
    warn(LOG_CATEGORIES.SKILL, `Invalid shortcut slot index: ${msg.slotIndex}`);
    return;
  }

  // If clearing the slot, allow it
  if (msg.skillId === null) {
    if (setSkillShortcut(player, msg.slotIndex, null)) {
      debug(LOG_CATEGORIES.SKILL, `Player ${player.id} cleared shortcut slot ${msg.slotIndex}`);
      emitShortcutChange(direct, outbound, player, msg.slotIndex, null);
    }
    return;
  }

  // Validate skill is unlocked
  if (!player.unlockedSkills.includes(msg.skillId)) {
    warn(LOG_CATEGORIES.SKILL, `Player ${player.id} tried to shortcut skill they don't have: ${msg.skillId}`);
    return;
  }

  // Update skill shortcut
  if (setSkillShortcut(player, msg.slotIndex, msg.skillId)) {
    debug(LOG_CATEGORIES.SKILL, `Player ${player.id} set shortcut slot ${msg.slotIndex} to skill: ${msg.skillId}`);
    emitShortcutChange(direct, outbound, player, msg.slotIndex, msg.skillId);
  } else {
    warn(LOG_CATEGORIES.SKILL, `Failed to set shortcut for player ${player.id}`);
  }
}

function findPlayerBySocket(state: GameState, socketId: string): PlayerState | undefined {
  return Object.values(state.players).find((player) => player.socketId === socketId);
}

function sendSkillLearned(direct: DirectMessageSink, skillId: SkillId, remainingPoints: number): void {
  direct.send({
    type: 'SkillLearned',
    skillId,
    remainingPoints
  });
}

function emitShortcutChange(
  direct: DirectMessageSink,
  outbound: OutboundEventSink,
  player: PlayerState,
  slotIndex: number,
  skillId: SkillId | null,
): void {
  direct.send({
    type: 'SkillShortcutUpdated',
    slotIndex,
    skillId
  });

  emitPlayerUpdated(outbound, {
    id: player.id,
    skillShortcuts: player.skillShortcuts
  });
}

function isValidShortcutSlot(slotIndex: number): boolean {
  return slotIndex >= 0 && slotIndex <= 8;
}
