import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { PlayerState } from '../../../packages/sim/entities.js';
import type { CommandRejectionReason } from '../../../packages/protocol/commandRejections.js';
import { QUEST_NPCS } from '../../../packages/content/npcs.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import {
  applyClaimQuestReward,
  onTalkedToNpcForQuests,
} from '../../players/playerQuests.js';
import { sendCommandRejected } from '../../transport/commandRejected.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function onTalkNpc(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'TalkNpc' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  // TalkNpc has three roles: gates talk-objective progress, gives
  // the dialog UI a server-validated "yes you can interact" signal,
  // and (PR KK) speaks the NPC's greeting line so the Greet button
  // produces visible feedback. Dialog itself is rendered client-side
  // from QUEST_NPCS + QUESTS content.
  onTalkedToNpcForQuests(player, msg.npcId, outbound);
  emitNpcGreeting(player.socketId, msg.npcId, outbound);
}

function emitNpcGreeting(
  socketId: string,
  npcId: string,
  outbound: OutboundEventSink,
): void {
  const npc = QUEST_NPCS[npcId];
  if (!npc) return;
  const text = npc.greet ?? `${npc.name} nods in acknowledgement.`;
  outbound.publish({
    type: 'directServerMessage',
    socketId,
    message: {
      type: 'ChatBroadcast',
      fromId: npc.id,
      fromName: npc.name,
      text,
      scope: 'near',
      ts: Date.now(),
    },
  });
}

export function onQuestVerb(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  // Archwork #3 — quest verbs are the four rejectable types; the
  // typed parameter keeps the rejection emit narrow.
  // Archwork #4 — `clientSeq` is now optional on the wire so the
  // server can echo it back as `requestId` for client-side
  // correlation.
  msg: { type: 'AcceptQuest' | 'CancelQuest' | 'AdvanceQuest' | 'ClaimQuestReward'; questId: string; clientSeq?: number },
  outbound: OutboundEventSink,
  apply: (player: PlayerState, questId: string, outbound: OutboundEventSink, now: number) => boolean,
): void {
  type QuestRejectReason = CommandRejectionReason<'AcceptQuest'>
    & CommandRejectionReason<'CancelQuest'>
    & CommandRejectionReason<'AdvanceQuest'>
    & CommandRejectionReason<'ClaimQuestReward'>;
  const reject = (reason: QuestRejectReason) =>
    sendCommandRejected<typeof msg.type>(direct, msg.type, reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return reject('playerNotFound');
  const player = state.players[playerId];
  if (!player) return reject('playerNotFound');
  if (!apply(player, msg.questId, outbound, Date.now())) reject('noEffect');
}

export function onClaimQuestReward(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'ClaimQuestReward' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'ClaimQuestReward'>) =>
    sendCommandRejected(direct, 'ClaimQuestReward', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return reject('playerNotFound');
  const player = state.players[playerId];
  if (!player) return reject('playerNotFound');
  const ok = applyClaimQuestReward(player, msg.questId, outbound, Date.now(), state);
  if (!ok) reject(claimRejectReason(player, msg.questId));
}

function claimRejectReason(player: PlayerState, questId: string): CommandRejectionReason<'ClaimQuestReward'> {
  const entry = player.questState?.active?.[questId];
  if (!entry) return 'notActive';
  if (!entry.readyToClaim) return 'notReady';
  return 'notNearNpc';
}
