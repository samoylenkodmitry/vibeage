import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { CommandRejectionReason } from '../../../packages/protocol/commandRejections.js';
import { LOG_CATEGORIES, warn } from '../../logger.js';
import { isGmModeEnabled } from '../../players/gmMode.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import {
  applyClassChange,
  applyRaceChange,
  applySkillUpgrade,
  applySpecializationChange,
  applySpecializationRespec,
} from '../../players/playerIdentity.js';
import { sendCommandRejected } from '../../transport/commandRejected.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function onSelectClass(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectClass' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'SelectClass'>) =>
    sendCommandRejected(direct, 'SelectClass', reason, msg.clientSeq);
  if (!isGmModeEnabled()) {
    warn(LOG_CATEGORIES.PLAYER, `SelectClass rejected (not GM) for ${socket.id}`);
    reject('notGm');
    return;
  }
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  applyClassChange(player, msg.className, outbound);
}

export function onSelectRace(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectRace' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'SelectRace'>) =>
    sendCommandRejected(direct, 'SelectRace', reason, msg.clientSeq);
  if (!isGmModeEnabled()) {
    warn(LOG_CATEGORIES.PLAYER, `SelectRace rejected (not GM) for ${socket.id}`);
    reject('notGm');
    return;
  }
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  applyRaceChange(player, msg.race, outbound);
}

export function onSelectSpecialization(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SelectSpecialization' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) return;
  const player = state.players[playerId];
  if (!player) return;
  applySpecializationChange(player, msg.specializationId, outbound);
}

export function onRespecSpecialization(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'RespecSpecialization' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'RespecSpecialization'>) =>
    sendCommandRejected(direct, 'RespecSpecialization', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const result = applySpecializationRespec(player, outbound);
  if (result.ok === false) reject(result.reason);
}

export function onUpgradeSkill(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'UpgradeSkill' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'UpgradeSkill'>) =>
    sendCommandRejected(direct, 'UpgradeSkill', reason, msg.clientSeq, msg.skillId);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    reject('playerNotFound');
    return;
  }
  const result = applySkillUpgrade(player, msg.skillId, outbound);
  if (result.ok === false) reject(result.reason as CommandRejectionReason<'UpgradeSkill'>);
}
