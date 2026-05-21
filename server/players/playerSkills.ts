import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { canLearnSkill, CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import {
  getSpecForSkill,
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
} from '../../packages/content/specializations.js';
import type { LearnSkill, LearnSkillFailedMsg, SetSkillShortcut } from '../../packages/protocol/messages.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { debug, error as logError, LOG_CATEGORIES, warn } from '../logger.js';
import { findPlayerIdBySocket } from './playerSession.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import { emitStarterProgressUpdate, syncPlayerStarterProgress } from '../progression/starterPath.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { sendCommandRejected } from '../transport/commandRejected.js';

type SkillClient = { id: string };

type SkillPlayer = {
  id: string;
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
  specializationId?: string | null;
};

export function onLearnSkill(
  socket: SkillClient,
  direct: DirectMessageSink,
  outbound: OutboundEventSink,
  state: GameState,
  msg: LearnSkill,
): void {
  const reject = (reason: LearnSkillFailedMsg['reason']) =>
    sendLearnSkillFailed(direct, msg.skillId, reason, msg.clientSeq);
  const player = findPlayerBySocket(state, socket.id);
  if (!player) {
    warn(LOG_CATEGORIES.SKILL, `Learn skill request from unknown socket: ${socket.id}`);
    // No player → no DirectMessageSink would route to them anyway; the
    // SDK already filters unknown sockets. Skip the rejection emit.
    return;
  }

  if (player.unlockedSkills.includes(msg.skillId)) {
    sendSkillLearned(direct, msg.skillId, player.availableSkillPoints);
    return;
  }

  const rejection = classifyLearnRejection(player, msg.skillId);
  if (rejection) {
    warn(LOG_CATEGORIES.SKILL, `Player ${player.id} cannot learn skill: ${msg.skillId} (${rejection})`);
    reject(rejection);
    return;
  }

  if (!learnNewSkill(player, msg.skillId)) {
    // Catch-all if the actual mutation still rejects (shouldn't happen after the
    // classifier above passed). Surface a generic missingPrereq.
    reject('missingPrereq');
    return;
  }

  const starterProgress = syncPlayerStarterProgress(player);
  // PR QQ — learning a passive skill changes player stats. The
  // Contribution registry reads unlockedSkills, so any addition
  // (passive or active that carries a contribution) needs a
  // recompute or the breakdown popup / engine numbers stay stale.
  // Cheap: just call recomputePlayerStats; the cache invalidates
  // implicitly because unlockedSkills mutated.
  recomputePlayerStats(player);
  sendSkillLearned(direct, msg.skillId, player.availableSkillPoints);
  emitPlayerUpdated(outbound, {
    id: player.id,
    unlockedSkills: player.unlockedSkills,
    skillShortcuts: player.skillShortcuts,
    availableSkillPoints: player.availableSkillPoints,
    stats: player.stats,
    maxHealth: player.maxHealth,
    maxMana: player.maxMana,
  });
  emitStarterProgressUpdate(outbound, player, starterProgress.rewardGranted);
}

function classifyLearnRejection(
  player: SkillPlayer,
  skillId: SkillId,
): LearnSkillFailedMsg['reason'] | null {
  if (!SKILLS[skillId]) {
    return 'unknownSkill';
  }
  // Spec / proficiency skills aren't in CLASS_SKILL_TREES — they're
  // routed via SPECIALIZATIONS instead. Classify rejection against
  // the spec gate (matching specializationId + minimum level).
  const specEntry = getSpecForSkill(skillId);
  if (specEntry) {
    if (player.specializationId !== specEntry.spec.id) {
      return 'wrongClass';
    }
    const required = specEntry.tier === 'proficiency' ? PROFICIENCY_LEVEL : SPECIALIZATION_UNLOCK_LEVEL;
    if (player.level < required) return 'levelTooLow';
    if (player.availableSkillPoints <= 0) return 'noSkillPoints';
    return null;
  }
  const classTree = CLASS_SKILL_TREES[player.className as CharacterClass];
  if (!classTree) {
    return 'wrongClass';
  }
  const requirement = classTree.skillProgression[skillId];
  if (!requirement) {
    return 'wrongClass';
  }
  if (player.level < requirement.level) {
    return 'levelTooLow';
  }
  if (requirement.requiredSkills && !requirement.requiredSkills.every((prereq) => player.unlockedSkills.includes(prereq))) {
    return 'missingPrereq';
  }
  if (player.availableSkillPoints <= 0) {
    return 'noSkillPoints';
  }
  return null;
}

// §4/§52 — emit BOTH the legacy `LearnSkillFailed` (kept so older
// clients still see the rejection) AND the structured `CommandRejected`
// envelope. Migration is per-command; once the client UI consumes
// `CommandRejected` for skill learning, the legacy can retire.
function sendLearnSkillFailed(
  direct: DirectMessageSink,
  skillId: SkillId,
  reason: LearnSkillFailedMsg['reason'],
  clientSeq?: number,
): void {
  direct.send({ type: 'LearnSkillFailed', skillId, reason });
  sendCommandRejected(direct, 'LearnSkill', reason, clientSeq);
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

  // Spec / proficiency skill gate: the skill belongs to a spec
  // (data-driven via SPECIALIZATIONS[id].specSkills /
  // proficiencySkills). Engine accepts it only when the player has
  // matching specialization AND the right level (spec at Lv 20,
  // proficiency at Lv 40). Same shape as the base class-tree gate
  // below — no per-spec code path.
  const specEntry = getSpecForSkill(skillId);
  if (specEntry) {
    if (player.specializationId !== specEntry.spec.id) return false;
    const required = specEntry.tier === 'proficiency' ? PROFICIENCY_LEVEL : SPECIALIZATION_UNLOCK_LEVEL;
    if (player.level < required) return false;
    return true;
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

function setSkillShortcut(
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
