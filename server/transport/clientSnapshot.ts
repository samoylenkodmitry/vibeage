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
import { SOCKET_SESSION_EVENTS } from './roomBoundary.js';

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

  client.send(SOCKET_SESSION_EVENTS.joinGame, { playerId: player.id });
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
