import { Room, type Client } from '@colyseus/core';
import { ZoneManager } from '../../packages/content/zones.js';
import type { ServerMessage } from '../../packages/protocol/messages.js';
import { initWorld } from '../world.js';
import { sendCastSnapshots } from '../combat/skillSystem.js';
import { emitInventoryUpdate } from '../world/clientMessageRouter.js';
import { sendStarterProgressUpdate } from '../progression/starterPath.js';
import { createSocketBackedAuthoritativeRoom } from './authoritativeRoomAdapter.js';
import { ColyseusAuthoritativeRoomAdapter, makeColyseusOutbound } from './colyseusRoomAdapter.js';
import { makeClientGameStateSnapshot, sanitizePlayerForPublic } from './clientState.js';
import { parseWorldRoomJoinOptions, SOCKET_SESSION_EVENTS } from './roomBoundary.js';
import type { DirectMessageSink } from './outboundEvents.js';
import { findPlayerIdBySocket } from '../players/playerSession.js';

const MAX_CLIENTS = 200;

export class VibeAgeRoom extends Room {
  private adapter!: ColyseusAuthoritativeRoomAdapter;
  private world!: ReturnType<typeof initWorld>;

  onCreate(): void {
    this.maxClients = MAX_CLIENTS;
    this.autoDispose = false;

    const outbound = makeColyseusOutbound(this);
    this.world = initWorld(outbound, new ZoneManager());
    this.adapter = new ColyseusAuthoritativeRoomAdapter(
      createSocketBackedAuthoritativeRoom(this.world),
    );

    this.onMessage(SOCKET_SESSION_EVENTS.message, (client, message) => {
      this.adapter.handleMessage(client, message);
    });
    this.onMessage(SOCKET_SESSION_EVENTS.requestGameState, (client) => {
      this.sendClientSnapshot(client);
    });
  }

  async onJoin(client: Client, options?: unknown): Promise<void> {
    const result = await this.adapter.handleJoin(client, parseWorldRoomJoinOptions(options));
    const player = this.world.getGameState().players[result.playerId];
    if (player) {
      this.broadcast(SOCKET_SESSION_EVENTS.playerJoined, sanitizePlayerForPublic(player), { except: client });
    }
    this.sendClientSnapshot(client);
  }

  async onLeave(client: Client): Promise<void> {
    const playerId = await this.adapter.handleLeave(client);
    if (playerId) {
      this.broadcast(SOCKET_SESSION_EVENTS.playerLeft, playerId);
    }
  }

  private sendClientSnapshot(client: Client): void {
    const state = this.world.getGameState();
    const playerId = findPlayerIdBySocket(state, client.sessionId);
    const player = playerId ? state.players[playerId] : null;
    const direct = makeColyseusDirectSink(client);

    if (player) {
      client.send(SOCKET_SESSION_EVENTS.joinGame, { playerId: player.id });
      emitInventoryUpdate(direct, player);
      sendStarterProgressUpdate(direct, player);
    }

    client.send(SOCKET_SESSION_EVENTS.gameState, makeClientGameStateSnapshot(state, client.sessionId));
    sendCastSnapshots(state.activeCasts, direct);
  }
}

function makeColyseusDirectSink(client: Client): DirectMessageSink {
  return {
    send(message: ServerMessage) {
      client.send(SOCKET_SESSION_EVENTS.message, message);
    },
  };
}
