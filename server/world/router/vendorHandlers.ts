import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { CommandRejectionReason } from '../../../packages/protocol/commandRejections.js';
import { applyBuyFromVendor, applySellToVendor } from '../../players/playerVendor.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import { sendCommandRejected } from '../../transport/commandRejected.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function onBuyFromVendor(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'BuyFromVendor' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'BuyFromVendor'>) =>
    sendCommandRejected(direct, 'BuyFromVendor', reason, msg.clientSeq);
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
  const result = applyBuyFromVendor(player, msg.vendorId, msg.itemId, msg.quantity, outbound);
  if (result.ok === false) reject(result.reason as CommandRejectionReason<'BuyFromVendor'>);
}

export function onSellToVendor(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'SellToVendor' }>,
  outbound: OutboundEventSink,
): void {
  const reject = (reason: CommandRejectionReason<'SellToVendor'>) =>
    sendCommandRejected(direct, 'SellToVendor', reason, msg.clientSeq);
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
  const result = applySellToVendor(player, msg.vendorId, msg.itemId, msg.quantity, outbound);
  if (result.ok === false) reject(result.reason as CommandRejectionReason<'SellToVendor'>);
}
