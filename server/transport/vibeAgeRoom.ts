import { Room, type Client } from '@colyseus/core';
import { ZoneManager } from '../../packages/content/zones.js';
import { initWorld } from '../world.js';
import { createSocketBackedAuthoritativeRoom } from './authoritativeRoomAdapter.js';
import { ColyseusAuthoritativeRoomAdapter, makeColyseusOutbound } from './colyseusRoomAdapter.js';
import { SOCKET_SESSION_EVENTS } from './roomBoundary.js';
import {
  joinWorldRoomClient,
  leaveWorldRoomClient,
  sendWorldRoomClientSnapshot,
} from './worldRoomLifecycle.js';

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
    await joinWorldRoomClient<Client>(this, this.adapter, this.world, client, options);
  }

  async onLeave(client: Client): Promise<void> {
    await leaveWorldRoomClient<Client>(this, this.adapter, client);
  }

  private sendClientSnapshot(client: Client): void {
    sendWorldRoomClientSnapshot(this.world, client);
  }
}
