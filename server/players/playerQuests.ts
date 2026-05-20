import { formatRewardSummary, meetsQuestPrerequisites, QUESTS, type QuestDef, type QuestId } from '../../packages/content/quests.js';
import { QUEST_NPCS, INTERACTION_RANGE } from '../../packages/content/npcs.js';
import type { PlayerActiveQuestProgress, PlayerQuestState, PlayerState } from '../../packages/sim/entities.js';
import { log, LOG_CATEGORIES, warn } from '../logger.js';
import {
  emitPlayerUpdated,
  emitServerMessage,
  emitServerMessageToClient,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { addItemsToPlayer, ensureCharacterInventory } from '../inventory/aggregateBridge.js';
import { flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter.js';

function ensureQuestState(player: PlayerState): PlayerQuestState {
  if (!player.questState) {
    player.questState = { active: {}, completed: [] };
  }
  return player.questState;
}

function isNearNpc(player: PlayerState, npcId: string): boolean {
  const npc = QUEST_NPCS[npcId];
  if (!npc) return false;
  const dx = npc.position.x - player.position.x;
  const dz = npc.position.z - player.position.z;
  return Math.hypot(dx, dz) <= INTERACTION_RANGE;
}

/**
 * Player wants to accept a quest. Validates:
 *   - quest exists
 *   - giver NPC matches and player is near
 *   - player meets minLevel
 *   - quest not already active or completed
 * On success: seeds active[questId] = {stageIndex: 0, progress: 0}.
 */
export function applyAcceptQuest(
  player: PlayerState,
  questId: QuestId,
  outbound: OutboundEventSink,
): boolean {
  const quest = QUESTS[questId];
  if (!quest) return false;
  if (!isNearNpc(player, quest.npcId)) {
    warn(LOG_CATEGORIES.PLAYER, `AcceptQuest ${questId}: player ${player.id} not near ${quest.npcId}`);
    emitAcceptFeedback(player, outbound, `You're too far from ${QUEST_NPCS[quest.npcId]?.name ?? 'the quest giver'} to accept this.`);
    return false;
  }
  if (player.level < quest.minLevel) {
    emitAcceptFeedback(player, outbound, `You need level ${quest.minLevel} to accept "${quest.name}".`);
    return false;
  }
  const state = ensureQuestState(player);
  if (state.active[questId] || state.completed.includes(questId)) return false;
  // §49/M6 PR029 — gate on completed-quest prerequisites.
  if (!meetsQuestPrerequisites(quest, { completedQuests: state.completed })) {
    warn(LOG_CATEGORIES.PLAYER, `AcceptQuest ${questId}: player ${player.id} missing prerequisites`);
    emitAcceptFeedback(player, outbound, `"${quest.name}" requires you to finish earlier quests first.`);
    return false;
  }
  state.active[questId] = { stageIndex: 0, progress: 0 };
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} accepted quest ${questId}`);
  emitPlayerUpdated(outbound, { id: player.id, questState: state });
  return true;
}

/**
 * §49/M2 — direct chat feedback when AcceptQuest fails for a known
 * reason. Goes only to the caller (so other players don't see
 * 'player X is underleveled') and rides the existing ChatBroadcast
 * channel which the HUD chat panel already renders.
 */
function emitAcceptFeedback(player: PlayerState, outbound: OutboundEventSink, text: string): void {
  const socketId = player.socketId;
  if (!socketId) return;
  emitServerMessageToClient(outbound, socketId, {
    type: 'ChatBroadcast',
    fromId: 'system',
    fromName: 'System',
    text,
    scope: 'near',
    ts: Date.now(),
  });
}

export function applyCancelQuest(
  player: PlayerState,
  questId: QuestId,
  outbound: OutboundEventSink,
): boolean {
  const state = ensureQuestState(player);
  if (!state.active[questId]) return false;
  delete state.active[questId];
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} cancelled quest ${questId}`);
  emitPlayerUpdated(outbound, { id: player.id, questState: state });
  return true;
}

/**
 * Player presses "Next" on the current stage. If the stage's
 * objective is met (auto-progress objectives already counted up;
 * manual stages always advance), bump stageIndex. If we were on
 * the last stage, flag readyToClaim — the player then presses
 * Claim to receive the reward via applyClaimQuestReward.
 */
export function applyAdvanceQuest(
  player: PlayerState,
  questId: QuestId,
  outbound: OutboundEventSink,
): boolean {
  const quest = QUESTS[questId];
  if (!quest) return false;
  const state = ensureQuestState(player);
  const entry = state.active[questId];
  if (!entry) return false;
  if (entry.readyToClaim) return false;
  // For reach-stages the player presses Next while standing on the
  // waypoint — fulfil the objective lazily here so we don't need a
  // separate movement-tick hook.
  maybeFulfillReachOnAdvance(player);
  if (!isStageComplete(quest, entry)) return false;
  if (entry.stageIndex + 1 < quest.stages.length) {
    entry.stageIndex += 1;
    entry.progress = 0;
  } else {
    entry.readyToClaim = true;
  }
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} advanced quest ${questId} → stage ${entry.stageIndex}${entry.readyToClaim ? ' (ready)' : ''}`);
  emitPlayerUpdated(outbound, { id: player.id, questState: state });
  return true;
}

/**
 * Hand in: only valid if readyToClaim. Grants reward.xp / gold /
 * items (items added to inventory; if bag is full they're dropped
 * — TODO follow-up). Moves quest to completed.
 */
export function applyClaimQuestReward(
  player: PlayerState,
  questId: QuestId,
  outbound: OutboundEventSink,
): boolean {
  const quest = QUESTS[questId];
  if (!quest) return false;
  const state = ensureQuestState(player);
  const entry = state.active[questId];
  if (!entry?.readyToClaim) return false;
  if (!isNearNpc(player, quest.npcId)) return false;
  if (quest.reward.xp) player.experience += quest.reward.xp;
  if (quest.reward.gold) {
    player.gold = (player.gold ?? 0) + quest.reward.gold;
  }
  if (quest.reward.items && quest.reward.items.length > 0) {
    for (const grant of quest.reward.items) {
      addItemsToPlayer(player, grant.itemId, grant.quantity ?? 1);
    }
  }
  delete state.active[questId];
  if (!state.completed.includes(questId)) state.completed.push(questId);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} claimed quest ${questId}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    experience: player.experience,
    gold: player.gold,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(player)),
    questState: state,
  });
  // §49/M6 — system-chat toast so the player sees what they got
  // without watching the gold counter + bag for changes. Reuses
  // the existing ChatBroadcast render path; `fromId: 'system'`
  // marks it as a server-issued line. Empty reward bags skip.
  const summary = formatRewardSummary(quest.reward);
  if (summary) {
    emitServerMessage(outbound, {
      type: 'ChatBroadcast',
      fromId: 'system',
      fromName: 'Quest',
      text: `✓ ${quest.name} — ${summary}`,
      scope: 'all',
      ts: Date.now(),
    });
  }
  return true;
}

/**
 * Engine-driven kill objective progress. Called from the enemy-death
 * hook on every kill: any active quest whose current stage is
 * `{kind: 'kill', enemyType: type}` increments progress (capped at
 * count). No per-quest conditional — adding a new kill quest is
 * content-only.
 */
export function onEnemyKilledForQuests(
  player: PlayerState,
  enemyType: string,
  outbound: OutboundEventSink,
  bossId?: string,
): void {
  if (!player.questState) return;
  let changed = false;
  for (const [questId, entry] of Object.entries(player.questState.active)) {
    const quest = QUESTS[questId];
    const stage = quest?.stages[entry.stageIndex];
    if (!stage) continue;
    const obj = stage.objective;
    if (obj.kind === 'kill' && obj.enemyType === enemyType) {
      const next = Math.min(obj.count, entry.progress + 1);
      if (next !== entry.progress) {
        entry.progress = next;
        changed = true;
      }
    } else if (obj.kind === 'kill_boss' && bossId && obj.bossId === bossId && entry.progress === 0) {
      // Named-boss objective: one kill, set progress 0 → 1 so the
      // claim flow advances on the next Next press.
      entry.progress = 1;
      changed = true;
    }
  }
  if (changed) {
    emitPlayerUpdated(outbound, { id: player.id, questState: player.questState });
  }
}

/**
 * Engine-driven "near a position" objective progress. Called from
 * the movement tick; sets progress=1 once the player enters radius
 * for any active reach-stage. Same data-driven shape as the kill
 * hook above.
 */
export function onPositionChangedForQuests(
  player: PlayerState,
  outbound: OutboundEventSink,
): void {
  if (!player.questState) return;
  let changed = false;
  for (const [questId, entry] of Object.entries(player.questState.active)) {
    const quest = QUESTS[questId];
    const stage = quest?.stages[entry.stageIndex];
    if (stage?.objective.kind === 'reach' && entry.progress === 0) {
      const dx = stage.objective.position.x - player.position.x;
      const dz = stage.objective.position.z - player.position.z;
      if (Math.hypot(dx, dz) <= stage.objective.radius) {
        entry.progress = 1;
        changed = true;
      }
    }
  }
  if (changed) {
    emitPlayerUpdated(outbound, { id: player.id, questState: player.questState });
  }
}

/** Talk-objective auto-progress: called from TalkNpc handler. */
export function onTalkedToNpcForQuests(
  player: PlayerState,
  npcId: string,
  outbound: OutboundEventSink,
): void {
  if (!player.questState) return;
  let changed = false;
  for (const [questId, entry] of Object.entries(player.questState.active)) {
    const quest = QUESTS[questId];
    const stage = quest?.stages[entry.stageIndex];
    if (stage?.objective.kind === 'talk' && stage.objective.npcId === npcId && entry.progress === 0) {
      entry.progress = 1;
      changed = true;
    }
  }
  if (changed) {
    emitPlayerUpdated(outbound, { id: player.id, questState: player.questState });
  }
}

function isStageComplete(quest: QuestDef, entry: PlayerActiveQuestProgress): boolean {
  const stage = quest.stages[entry.stageIndex];
  if (!stage) return false;
  switch (stage.objective.kind) {
    case 'kill': return entry.progress >= stage.objective.count;
    case 'kill_boss': return entry.progress >= 1;
    case 'reach': return entry.progress >= 1;
    case 'talk': return entry.progress >= 1;
    case 'manual': return true;
  }
}

/**
 * Convenience: server-side adapter that checks the player's current
 * position against any active reach-stage and sets progress=1 if
 * they're inside the radius. Called from applyAdvanceQuest so the
 * player can press "Next" while standing on the waypoint without
 * needing a separate movement-tick hook. Cheap; only runs on the
 * explicit advance verb.
 */
export function maybeFulfillReachOnAdvance(player: PlayerState): void {
  if (!player.questState) return;
  for (const [questId, entry] of Object.entries(player.questState.active)) {
    const quest = QUESTS[questId];
    const stage = quest?.stages[entry.stageIndex];
    if (stage?.objective.kind === 'reach' && entry.progress === 0) {
      const dx = stage.objective.position.x - player.position.x;
      const dz = stage.objective.position.z - player.position.z;
      if (Math.hypot(dx, dz) <= stage.objective.radius) {
        entry.progress = 1;
      }
    }
  }
}
