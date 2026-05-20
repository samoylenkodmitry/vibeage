import type { ServerMessage } from '../../packages/protocol/messages.js';
import { sendCastSnapshots } from '../combat/skillSystem.js';
import type { GameState } from '../gameState.js';
import { sendEquipment } from '../inventory/equipHandlers.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';
import { sendStarterProgressUpdate } from '../progression/starterPath.js';
import { emitInventoryUpdate } from '../world/clientMessageRouter.js';
import type { ServerWorldRegion } from '../world/regions.js';
import { makeClientGameStateSnapshot } from './clientState.js';
import type { DirectMessageSink } from './outboundEvents.js';
import { SERVER_PROTOCOL_VERSION, SOCKET_SESSION_EVENTS } from './roomBoundary.js';

export type SnapshotClient = {
  sessionId: string;
  send(event: string, payload?: unknown): unknown;
};

export function sendClientInitialSnapshot(
  client: SnapshotClient,
  state: GameState,
  direct: DirectMessageSink,
  regions?: readonly ServerWorldRegion[],
): void {
  sendJoinedPlayerState(client, state, direct);
  sendClientGameStateSnapshot(client, state, regions);
  sendCastSnapshots(state.activeCasts, direct);
}

export function sendClientGameStateSnapshot(
  client: SnapshotClient,
  state: GameState,
  regions?: readonly ServerWorldRegion[],
): void {
  client.send(SOCKET_SESSION_EVENTS.gameState, makeClientGameStateSnapshot(state, client.sessionId, regions));
}

function sendJoinedPlayerState(
  client: SnapshotClient,
  state: GameState,
  direct: DirectMessageSink,
): void {
  const playerId = findPlayerIdBySocket(state, client.sessionId);
  const player = playerId ? state.players[playerId] : null;

  if (!player) {
    return;
  }

  // §46/slice-1 — stamp the server's protocol version on every
  // successful join so the client can warn if it's running an
  // older bundle than the server speaks.
  client.send(SOCKET_SESSION_EVENTS.joinGame, {
    playerId: player.id,
    serverProtocolVersion: SERVER_PROTOCOL_VERSION,
  });
  emitInventoryUpdate(direct, player);
  sendEquipment(direct, player);
  sendStarterProgressUpdate(direct, player);
}

export function makeClientDirectSink(client: SnapshotClient): DirectMessageSink {
  return {
    send(message: ServerMessage) {
      client.send(SOCKET_SESSION_EVENTS.message, message);
    },
  };
}
