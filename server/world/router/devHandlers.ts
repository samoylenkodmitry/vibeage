import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { CommandRejectionReason } from '../../../packages/protocol/commandRejections.js';
import { debug, LOG_CATEGORIES, warn } from '../../logger.js';
import { applyDevTeleport, isDevCommandsEnabled } from '../../movement/devTeleport.js';
import { applyGmCommand } from '../../players/gmCommand.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import { sendCommandRejected } from '../../transport/commandRejected.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function onDevTeleport(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'DevTeleport' }>,
): void {
  if (!isDevCommandsEnabled()) {
    warn(LOG_CATEGORIES.MOVEMENT, `DevTeleport rejected (VIBEAGE_ENABLE_DEV_COMMANDS not set) for ${msg.id}`);
    return;
  }

  const result = applyDevTeleport(state, socket.id, msg);

  if (result.ok === false) {
    warn(LOG_CATEGORIES.MOVEMENT, `DevTeleport rejected: ${result.reason}`, {
      playerId: result.playerId,
      targetPos: msg.targetPos,
    });
    return;
  }

  debug(LOG_CATEGORIES.MOVEMENT, `Player ${result.playerId} teleported`, { targetPos: msg.targetPos });
}

export function onGmCommand(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'GmCommand' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'GmCommand'>) =>
    sendCommandRejected(direct, 'GmCommand', reason, msg.clientSeq);
  const playerId = findPlayerIdBySocket(state, socket.id);
  if (!playerId) {
    reject('playerNotFound');
    return;
  }
  const caller = state.players[playerId];
  if (!caller) {
    reject('playerNotFound');
    return;
  }
  applyGmCommand(caller, msg, (id) => state.players[id], outbound);
}
