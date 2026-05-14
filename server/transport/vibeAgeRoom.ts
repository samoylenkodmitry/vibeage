import { Room, type Client } from '@colyseus/core';
import { ZoneManager } from '../../packages/content/zones.js';
import { initWorld } from '../world.js';
import { createSocketBackedAuthoritativeRoom } from './authoritativeRoomAdapter.js';
import { ColyseusAuthoritativeRoomAdapter, makeColyseusOutbound } from './colyseusRoomAdapter.js';
import { sanitizePlayerForPublic } from './clientState.js';
import { makeClientDirectSink, sendClientInitialSnapshot } from './clientSnapshot.js';
import { parseWorldRoomJoinOptions, SOCKET_SESSION_EVENTS } from './roomBoundary.js';

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
    sendClientInitialSnapshot(client, this.world.getGameState(), makeClientDirectSink(client));
  }
}
