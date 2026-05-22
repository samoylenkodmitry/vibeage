import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { CommandRejectionReason } from '../../../packages/protocol/commandRejections.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import { sendCommandRejected } from '../../transport/commandRejected.js';
import type { SpatialHashGrid } from '../../spatial/SpatialHashGrid.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

const CHAT_NEAR_RADIUS = 150;

export function onChatRequest(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'ChatRequest' }>,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const reject = (reason: CommandRejectionReason<'ChatRequest'>) =>
    sendCommandRejected(direct, 'ChatRequest', reason, msg.clientSeq);
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
  const text = msg.text.trim().slice(0, 240);
  if (!text) {
    reject('emptyText');
    return;
  }
  const broadcast = {
    type: 'ChatBroadcast' as const,
    fromId: playerId,
    fromName: player.name,
    text,
    scope: msg.scope,
    ts: Date.now(),
  };

  if (msg.scope === 'all') {
    outbound.publish({ type: 'serverMessage', message: broadcast });
    return;
  }

  const nearbyIds = spatial.queryCircle({ x: player.position.x, z: player.position.z }, CHAT_NEAR_RADIUS);
  const seen = new Set<string>();
  for (const id of nearbyIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const other = state.players[id];
    if (!other?.socketId) continue;
    outbound.publish({ type: 'directServerMessage', socketId: other.socketId, message: broadcast });
  }
}
